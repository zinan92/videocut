# Videocut Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor videocut from monolithic scripts into 7 independent CLI capabilities with shared lib and pipeline chaining.

**Architecture:** Mixed Node.js (orchestration, data) + Bash (FFmpeg, Whisper). Zero npm dependencies. Each capability is a directory under `capabilities/` with `index.js` + shell scripts + `SKILL.md`.

**Tech Stack:** Node.js (built-ins only), Bash, FFmpeg, Whisper, Claude CLI, Chrome Headless

**Spec:** `docs/superpowers/specs/2026-03-30-videocut-modularization-design.md`

---

## Task 1: Shared Library — lib/ffmpeg.js

**Files:**
- Create: `lib/ffmpeg.js`
- Create: `tests/lib/ffmpeg.test.js`

- [ ] **Step 1: Write test for ffmpeg.run()**

```js
// tests/lib/ffmpeg.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { run, probe } = require('../../lib/ffmpeg');

describe('ffmpeg', () => {
  it('run() rejects on invalid input', async () => {
    await assert.rejects(
      () => run(['-i', 'nonexistent.mp4', '-f', 'null', '-']),
      (err) => {
        assert.ok(err.message.includes('No such file'));
        return true;
      }
    );
  });

  it('probe() returns duration for valid file', async () => {
    await run([
      '-y', '-f', 'lavfi', '-i', 'color=black:size=320x240:duration=1',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-t', '1', '-c:v', 'libx264', '-c:a', 'aac',
      '/tmp/videocut_test.mp4'
    ]);
    const info = await probe('/tmp/videocut_test.mp4');
    assert.ok(info.duration > 0.9 && info.duration < 1.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/ffmpeg.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/ffmpeg.js**

```js
// lib/ffmpeg.js
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

async function run(args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(FFMPEG, args, {
      maxBuffer: 50 * 1024 * 1024,
      ...opts,
    });
    return { stdout, stderr };
  } catch (err) {
    const msg = err.stderr || err.message;
    throw new Error(`FFmpeg failed: ${msg}`);
  }
}

async function probe(filePath) {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=width,height,bit_rate',
    '-of', 'json',
    `file:${filePath}`,
  ]);
  const data = JSON.parse(stdout);
  const fmt = data.format || {};
  const stream = (data.streams || [])[0] || {};
  return {
    duration: parseFloat(fmt.duration) || 0,
    width: stream.width || 0,
    height: stream.height || 0,
    bitrate: stream.bit_rate ? `${Math.round(parseInt(stream.bit_rate) / 1000)}k` : '5400k',
  };
}

async function extractAudio(videoPath, audioPath) {
  await run(['-y', '-i', `file:${videoPath}`, '-vn', '-acodec', 'libmp3lame', audioPath]);
  return audioPath;
}

module.exports = { run, probe, extractAudio };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/ffmpeg.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ffmpeg.js tests/lib/ffmpeg.test.js
git commit -m "feat: add lib/ffmpeg.js — FFmpeg/FFprobe wrapper"
```

---

## Task 2: Shared Library — lib/srt.js

**Files:**
- Create: `lib/srt.js`
- Create: `tests/lib/srt.test.js`

- [ ] **Step 1: Write tests for SRT parse/generate/merge**

```js
// tests/lib/srt.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseSRT, generateSRT, wordsToSRT } = require('../../lib/srt');

describe('srt', () => {
  const sampleSRT = `1
00:00:00,500 --> 00:00:02,000
你好世界

2
00:00:03,000 --> 00:00:05,500
第二句话
`;

  it('parseSRT() extracts entries with times in seconds', () => {
    const entries = parseSRT(sampleSRT);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].text, '你好世界');
    assert.ok(Math.abs(entries[0].start - 0.5) < 0.01);
    assert.ok(Math.abs(entries[0].end - 2.0) < 0.01);
  });

  it('generateSRT() produces valid SRT from entries', () => {
    const entries = [
      { start: 0.5, end: 2.0, text: '你好世界' },
      { start: 3.0, end: 5.5, text: '第二句话' },
    ];
    const srt = generateSRT(entries);
    assert.ok(srt.includes('00:00:00,500 --> 00:00:02,000'));
    assert.ok(srt.includes('你好世界'));
  });

  it('wordsToSRT() groups words into subtitle entries', () => {
    const words = [
      { text: '你好', start: 0.5, end: 0.9, isGap: false },
      { start: 0.9, end: 1.5, isGap: true },
      { text: '世界', start: 1.5, end: 2.0, isGap: false },
    ];
    const entries = wordsToSRT(words);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].text, '你好');
    assert.strictEqual(entries[1].text, '世界');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/srt.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/srt.js**

```js
// lib/srt.js
// Consolidated from: generate_srt.js + merge-srt-for-douyin.js

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseSRT(text) {
  const entries = [];
  const blocks = text.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const tm = lines[1].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!tm) continue;
    const start = +tm[1] * 3600 + +tm[2] * 60 + +tm[3] + +tm[4] / 1000;
    const end = +tm[5] * 3600 + +tm[6] * 60 + +tm[7] + +tm[8] / 1000;
    entries.push({ start, end, text: lines.slice(2).join('\n') });
  }
  return entries;
}

function generateSRT(entries) {
  return entries.map((e, i) =>
    `${i + 1}\n${formatTime(e.start)} --> ${formatTime(e.end)}\n${e.text}\n`
  ).join('\n');
}

const SENTENCE_ENDS = /[。！？.!?]/;

function wordsToSRT(words, { maxChars = 20, gapThreshold = 0.5 } = {}) {
  const subtitles = [];
  let text = '', start = -1, end = -1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.isGap) {
      if ((w.end - w.start) >= gapThreshold && text.length > 0) {
        subtitles.push({ start, end, text });
        text = ''; start = -1; end = -1;
      }
      continue;
    }
    if (start < 0) start = w.start;
    text += w.text;
    end = w.end;

    if (SENTENCE_ENDS.test(w.text)) {
      subtitles.push({ start, end, text });
      text = ''; start = -1; end = -1;
      continue;
    }
    if (text.length >= maxChars - 5) {
      const next = words[i + 1];
      if (!next || next.isGap) {
        subtitles.push({ start, end, text });
        text = ''; start = -1; end = -1;
      }
    }
  }
  if (text.length > 0) subtitles.push({ start, end, text });
  return subtitles;
}

function mergeSRT(hookEntries, mainEntries, hookDuration) {
  const offsetMain = mainEntries.map(e => ({
    start: e.start + hookDuration,
    end: e.end + hookDuration,
    text: e.text,
  }));
  return [...hookEntries, ...offsetMain];
}

module.exports = { parseSRT, generateSRT, wordsToSRT, mergeSRT, formatTime };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/srt.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/srt.js tests/lib/srt.test.js
git commit -m "feat: add lib/srt.js — SRT parse/generate/merge"
```

---

## Task 3: Shared Library — lib/claude.js

**Files:**
- Create: `lib/claude.js`
- Create: `tests/lib/claude.test.js`

- [ ] **Step 1: Write test for parse logic**

```js
// tests/lib/claude.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseAIOutput } = require('../../lib/claude');

describe('claude', () => {
  it('parseAIOutput() extracts JSON array from clean output', () => {
    const result = parseAIOutput('[1, 2, 3]');
    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it('parseAIOutput() strips code fences', () => {
    const result = parseAIOutput('```json\n[1, 2, 3]\n```');
    assert.deepStrictEqual(result, [1, 2, 3]);
  });

  it('parseAIOutput() returns null on garbage', () => {
    const result = parseAIOutput('sorry I cannot help');
    assert.strictEqual(result, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/claude.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/claude.js**

```js
// lib/claude.js
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function parseAIOutput(raw) {
  let text = raw.trim();
  text = text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callClaude(prompt, { maxRetries = 3, parser = null } = {}) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { stdout } = await execFileAsync('claude', [
        '-p', '--dangerously-skip-permissions', '--output-format', 'text',
      ], {
        input: prompt,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
      });

      if (!stdout || stdout.trim().length < 10) {
        throw new Error('Empty AI output');
      }

      if (parser) {
        const parsed = parser(stdout);
        if (parsed === null) throw new Error('Failed to parse AI output');
        return parsed;
      }
      return stdout.trim();
    } catch (err) {
      if (attempt < maxRetries) {
        console.error(`  Warning: Claude attempt ${attempt}/${maxRetries} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 3;
      } else {
        throw new Error(`Claude failed after ${maxRetries} attempts: ${err.message}`);
      }
    }
  }
}

module.exports = { callClaude, parseAIOutput };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/claude.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/claude.js tests/lib/claude.test.js
git commit -m "feat: add lib/claude.js — AI call with retry"
```

---

## Task 4: CLI Entry Point + package.json

**Files:**
- Create: `cli.js`
- Create: `package.json`
- Create: `tests/cli.test.js`

- [ ] **Step 1: Write test for CLI routing**

```js
// tests/cli.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);

describe('cli', () => {
  it('shows help when no args', async () => {
    const { stdout } = await exec('node', ['cli.js']);
    assert.ok(stdout.includes('videocut'));
    assert.ok(stdout.includes('transcribe'));
    assert.ok(stdout.includes('autocut'));
  });

  it('errors on unknown capability', async () => {
    await assert.rejects(
      () => exec('node', ['cli.js', 'bogus']),
      (err) => {
        assert.ok(err.stderr.includes('Unknown capability') || err.stdout.includes('Unknown capability'));
        return true;
      }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cli.test.js`
Expected: FAIL — file not found

- [ ] **Step 3: Create package.json**

```json
{
  "name": "videocut",
  "version": "1.0.0",
  "description": "AI-powered video editing capabilities for spoken-word content",
  "bin": {
    "videocut": "./cli.js"
  },
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  },
  "license": "MIT"
}
```

- [ ] **Step 4: Implement cli.js**

```js
#!/usr/bin/env node
// cli.js — Unified entry: videocut <capability> [input] [-o outputDir] [flags]

const path = require('node:path');
const fs = require('node:fs');

const CAPABILITIES = [
  'transcribe', 'autocut', 'subtitle', 'hook', 'clip', 'cover', 'speed', 'pipeline',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const capability = args[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }

  return { capability, input: positional[0], flags };
}

function showHelp() {
  console.log(`
videocut — AI-powered video editing capabilities

Usage: videocut <capability> <input> [-o outputDir] [flags]

Capabilities:
  transcribe   Speech to text (Whisper)
  autocut      Remove filler words, stutters, silence
  subtitle     Detect, generate, and burn subtitles
  hook         Extract memorable quotes as video clips
  clip         Split long video into chapter-based clips
  cover        Generate thumbnail and quote cards
  speed        Intelligent speed adjustment (1.1x-1.2x)
  pipeline     Chain multiple capabilities

Examples:
  videocut transcribe input.mp4 -o output/
  videocut autocut input.mp4 -o output/ --no-review
  videocut pipeline input.mp4 --steps autocut,subtitle,hook
`);
}

async function main() {
  const { capability, input, flags } = parseArgs(process.argv);

  if (!capability || capability === 'help' || capability === '--help') {
    showHelp();
    return;
  }

  if (!CAPABILITIES.includes(capability)) {
    console.error(`Unknown capability: "${capability}". Run "videocut help" for available capabilities.`);
    process.exit(1);
  }

  const outputDir = flags.o || flags.output || `./output/${new Date().toISOString().slice(0, 10)}_${path.basename(input || 'unknown', path.extname(input || ''))}`;

  if (input && !fs.existsSync(input)) {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  if (capability === 'pipeline') {
    const { run } = require('./pipeline');
    await run({ input, outputDir, options: flags });
  } else {
    const capModule = require(`./capabilities/${capability}/index`);
    await capModule.run({ input, outputDir, options: flags });
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/cli.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add cli.js package.json tests/cli.test.js
git commit -m "feat: add cli.js — unified CLI entry point"
```

---

## Task 5: Transcribe Capability

**Files:**
- Create: `capabilities/transcribe/index.js`
- Copy: `剪口播/scripts/whisper_transcribe.sh` to `capabilities/transcribe/whisper.sh`
- Copy: `剪口播/scripts/generate_subtitles.js` to `capabilities/transcribe/generate_words.js`
- Create: `capabilities/transcribe/SKILL.md`
- Create: `tests/capabilities/transcribe.test.js`

- [ ] **Step 1: Copy existing scripts**

```bash
mkdir -p capabilities/transcribe
cp 剪口播/scripts/whisper_transcribe.sh capabilities/transcribe/whisper.sh
cp 剪口播/scripts/generate_subtitles.js capabilities/transcribe/generate_words.js
chmod +x capabilities/transcribe/whisper.sh
```

- [ ] **Step 2: Write test**

```js
// tests/capabilities/transcribe.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('transcribe', () => {
  it('module exports run function', () => {
    const { run } = require('../../capabilities/transcribe/index');
    assert.strictEqual(typeof run, 'function');
  });

  it('run() rejects when input file does not exist', async () => {
    await assert.rejects(
      () => require('../../capabilities/transcribe/index').run({
        input: '/tmp/nonexistent_video.mp4',
        outputDir: '/tmp/vt_test_transcribe',
        options: {},
      }),
      (err) => err.message.includes('not found')
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/capabilities/transcribe.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Implement capabilities/transcribe/index.js**

```js
// capabilities/transcribe/index.js
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { extractAudio } = require('../../lib/ffmpeg');
const { wordsToSRT, generateSRT } = require('../../lib/srt');

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = __dirname;

async function run({ input, outputDir, options = {} }) {
  if (!fs.existsSync(input)) {
    throw new Error(`Input not found: ${input}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const model = options.model || 'small';
  const audioPath = path.join(outputDir, 'audio.mp3');
  const wordsPath = path.join(outputDir, 'transcript.json');
  const txtPath = path.join(outputDir, 'transcript.txt');
  const srtPath = path.join(outputDir, 'transcript.srt');

  // Cache check: skip if transcript.json already exists
  if (fs.existsSync(wordsPath)) {
    console.log('  Skipped: transcript.json already exists');
    const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
    return { words, srt: srtPath, txt: txtPath, artifacts: { wordsPath, txtPath, srtPath } };
  }

  // Step 1: Extract audio
  console.log('  Extracting audio...');
  await extractAudio(input, audioPath);

  // Step 2: Whisper transcribe
  console.log(`  Transcribing (model: ${model})...`);
  const whisperScript = path.join(SCRIPT_DIR, 'whisper.sh');
  await execFileAsync('bash', [whisperScript, audioPath, model], {
    cwd: outputDir,
    maxBuffer: 50 * 1024 * 1024,
  });

  // Step 3: Convert to canonical word-level format
  const volcResult = path.join(outputDir, 'volcengine_result.json');
  if (fs.existsSync(volcResult)) {
    console.log('  Generating word-level JSON...');
    const generateWords = path.join(SCRIPT_DIR, 'generate_words.js');
    await execFileAsync('node', [generateWords, volcResult], { cwd: outputDir });

    const rawWordsPath = path.join(outputDir, 'subtitles_words.json');
    if (fs.existsSync(rawWordsPath)) {
      fs.renameSync(rawWordsPath, wordsPath);
    }
  }

  // Step 4: Generate plain text
  const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const plainText = words.filter(w => !w.isGap).map(w => w.text).join('');
  fs.writeFileSync(txtPath, plainText);

  // Step 5: Generate SRT
  const srtEntries = wordsToSRT(words);
  fs.writeFileSync(srtPath, generateSRT(srtEntries));
  console.log(`  Done: ${srtEntries.length} subtitle entries`);

  return { words, srt: srtPath, txt: txtPath, artifacts: { wordsPath, txtPath, srtPath } };
}

module.exports = { run };
```

- [ ] **Step 5: Create SKILL.md**

Write `capabilities/transcribe/SKILL.md` with: name, description, prerequisites (FFmpeg, Whisper), usage, input/output spec, flow steps, and --model/--engine options.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/capabilities/transcribe.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add capabilities/transcribe/ tests/capabilities/transcribe.test.js
git commit -m "feat: add transcribe capability"
```

---

## Task 6: AutoCut Capability

**Files:**
- Create: `capabilities/autocut/index.js`
- Copy: `剪口播/scripts/cut_video.sh` to `capabilities/autocut/cut.sh`
- Copy: `剪口播/scripts/review_server.js` to `capabilities/autocut/review_server.js`
- Copy: `剪口播/scripts/feedback_aggregator.js` to `capabilities/autocut/feedback_aggregator.js`
- Copy: `剪口播/用户习惯/*.md` to `capabilities/autocut/rules/`
- Create: `capabilities/autocut/SKILL.md`
- Create: `tests/capabilities/autocut.test.js`

- [ ] **Step 1: Copy existing scripts and rules**

```bash
mkdir -p capabilities/autocut/rules
cp 剪口播/scripts/cut_video.sh capabilities/autocut/cut.sh
cp 剪口播/scripts/review_server.js capabilities/autocut/review_server.js
cp 剪口播/scripts/feedback_aggregator.js capabilities/autocut/feedback_aggregator.js
cp 剪口播/用户习惯/*.md capabilities/autocut/rules/
chmod +x capabilities/autocut/cut.sh
```

- [ ] **Step 2: Write test for helper functions**

```js
// tests/capabilities/autocut.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildDeleteSegments, buildFeedback } = require('../../capabilities/autocut/index');

describe('autocut', () => {
  it('buildDeleteSegments() converts word indices to time ranges', () => {
    const words = [
      { text: '你好', start: 0.0, end: 0.5, isGap: false },
      { start: 0.5, end: 1.2, isGap: true },
      { text: '世界', start: 1.2, end: 1.8, isGap: false },
    ];
    const segments = buildDeleteSegments(words, [1]);
    assert.strictEqual(segments.length, 1);
    assert.ok(Math.abs(segments[0].start - 0.5) < 0.01);
    assert.ok(Math.abs(segments[0].end - 1.2) < 0.01);
  });

  it('buildDeleteSegments() merges adjacent segments', () => {
    const words = [
      { text: '啊', start: 0.0, end: 0.3, isGap: false },
      { start: 0.3, end: 0.35, isGap: true },
      { text: '嗯', start: 0.35, end: 0.6, isGap: false },
      { text: '好', start: 0.6, end: 1.0, isGap: false },
    ];
    const segments = buildDeleteSegments(words, [0, 1, 2]);
    assert.strictEqual(segments.length, 1);
    assert.ok(Math.abs(segments[0].end - 0.6) < 0.01);
  });

  it('buildFeedback() records AI decisions', () => {
    const feedback = buildFeedback([1, 5], [3, 4]);
    assert.strictEqual(feedback.silence_count, 2);
    assert.strictEqual(feedback.ai_count, 2);
    assert.strictEqual(feedback.total_count, 4);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/capabilities/autocut.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Implement capabilities/autocut/index.js**

Extract logic from run.sh into a clean Node.js module. Key functions:
- `buildDeleteSegments(words, selectedIndices)` — convert word indices to merged time ranges
- `buildFeedback(silenceIndices, aiIndices)` — create feedback JSON
- `buildReadable(words)` — generate idx|text|time format for AI
- `buildSentences(words)` — generate sentence grouping for AI
- `run({ input, outputDir, options })` — full orchestration: transcribe -> silence detect -> AI analyze -> FFmpeg cut

The `run()` function calls `transcribe.run()`, reads rules from `capabilities/autocut/rules/*.md`, calls `callClaude()` from `lib/claude.js`, writes intermediate files, then shells out to `cut.sh`.

- [ ] **Step 5: Create SKILL.md**

Write `capabilities/autocut/SKILL.md` with: name, description, prerequisites, usage, input/output spec, flow steps, customization (add .md to rules/).

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/capabilities/autocut.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add capabilities/autocut/ tests/capabilities/autocut.test.js
git commit -m "feat: add autocut capability"
```

---

## Task 7: Subtitle Capability

**Files:**
- Create: `capabilities/subtitle/index.js`
- Copy: `剪口播/scripts/detect_hardcoded_subtitles.js` to `capabilities/subtitle/detect.js`
- Create: `capabilities/subtitle/burn.sh`
- Create: `capabilities/subtitle/SKILL.md`
- Create: `tests/capabilities/subtitle.test.js`

- [ ] **Step 1: Copy existing script and create burn.sh**

```bash
mkdir -p capabilities/subtitle
cp 剪口播/scripts/detect_hardcoded_subtitles.js capabilities/subtitle/detect.js
```

Create `capabilities/subtitle/burn.sh`:
```bash
#!/bin/bash
# burn.sh — Burn SRT subtitles into video
# Usage: burn.sh <input.mp4> <input.srt> <output.mp4>
INPUT="$1"; SRT="$2"; OUTPUT="$3"
if [ -z "$INPUT" ] || [ -z "$SRT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: burn.sh <input.mp4> <input.srt> <output.mp4>"; exit 1
fi
# Copy SRT to /tmp to avoid Unicode path issues with libass
TMP_DIR=$(mktemp -d)
cp "$SRT" "$TMP_DIR/subtitle.srt"
ffmpeg -y -i "file:$INPUT" \
  -vf "subtitles='${TMP_DIR}/subtitle.srt':force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=30'" \
  -c:a copy "file:$OUTPUT" 2>/dev/null
EXIT_CODE=$?; rm -rf "$TMP_DIR"
[ $EXIT_CODE -eq 0 ] && echo "Done: $OUTPUT" || { echo "Subtitle burn failed"; exit 1; }
```

- [ ] **Step 2: Write test**

```js
// tests/capabilities/subtitle.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('subtitle', () => {
  it('module exports run function', () => {
    const { run } = require('../../capabilities/subtitle/index');
    assert.strictEqual(typeof run, 'function');
  });
});
```

- [ ] **Step 3: Implement capabilities/subtitle/index.js**

Orchestration: detect hardcoded subtitles -> if none, transcribe input video -> generate SRT via `wordsToSRT` -> optionally burn via `burn.sh`. Uses transcription caching.

- [ ] **Step 4: Create SKILL.md**

- [ ] **Step 5: Run test, verify passes, commit**

```bash
git add capabilities/subtitle/ tests/capabilities/subtitle.test.js
git commit -m "feat: add subtitle capability"
```

---

## Task 8: Speed Capability

**Files:**
- Create: `capabilities/speed/index.js`
- Create: `capabilities/speed/adjust.sh`
- Create: `capabilities/speed/SKILL.md`
- Create: `tests/capabilities/speed.test.js`

- [ ] **Step 1: Write test**

```js
// tests/capabilities/speed.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { clampRate } = require('../../capabilities/speed/index');

describe('speed', () => {
  it('clampRate() caps at 1.2', () => assert.strictEqual(clampRate(1.5), 1.2));
  it('clampRate() floors at 1.0', () => assert.strictEqual(clampRate(0.8), 1.0));
  it('clampRate() passes valid rate', () => assert.strictEqual(clampRate(1.1), 1.1));
});
```

- [ ] **Step 2: Create adjust.sh**

FFmpeg `setpts=PTS/${RATE}` for video, `atempo=${RATE}` for audio (preserves pitch). H.264 output.

- [ ] **Step 3: Implement capabilities/speed/index.js**

Export `clampRate(rate)` (min 1.0, max 1.2) and `run({ input, outputDir, options })` which probes duration, logs the speed change, and shells out to `adjust.sh`.

- [ ] **Step 4: Create SKILL.md**

- [ ] **Step 5: Run test, verify passes, commit**

```bash
git add capabilities/speed/ tests/capabilities/speed.test.js
git commit -m "feat: add speed capability"
```

---

## Task 9: Hook Capability

**Files:**
- Create: `capabilities/hook/index.js`
- Create: `capabilities/hook/match.js` (refactored from ceo-donald/videocut/lib/hook-segments.js)
- Create: `capabilities/hook/concat.js` (refactored from ceo-donald/videocut/lib/hook-concat.js)
- Create: `capabilities/hook/SKILL.md`
- Create: `tests/capabilities/hook.test.js`

- [ ] **Step 1: Copy and refactor match.js**

Copy `~/work/content-co/ceo-donald/videocut/lib/hook-segments.js` to `capabilities/hook/match.js`. Wrap the main logic in an exported function:

```js
function matchHooksToSRT(quotes, srtContent, { maxCount = 4, maxDuration = 10, strictMode = false } = {})
  -> { segments, hookCount, totalDuration }
```

Keep the core algorithm (character-level SRT matching, fuzzy fallback via longest common substring, speed/overlap filtering, auto-expand segments < 3s, suspense cut) exactly as-is. Only change: module.exports instead of process.argv + fs.writeFileSync.

- [ ] **Step 2: Write test for match.js**

```js
// tests/capabilities/hook.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { matchHooksToSRT } = require('../../capabilities/hook/match');

describe('hook', () => {
  it('matchHooksToSRT() finds exact quote in SRT', () => {
    const quotes = [{ original_text: '你好世界', hook_score: 8 }];
    const srt = `1\n00:00:00,500 --> 00:00:01,000\n你好\n\n2\n00:00:01,000 --> 00:00:02,000\n世界很大\n`;
    const result = matchHooksToSRT(quotes, srt, { maxCount: 4 });
    assert.strictEqual(result.segments.length, 1);
    assert.ok(result.segments[0].start >= 0.4);
  });

  it('matchHooksToSRT() returns empty for no match', () => {
    const quotes = [{ original_text: '完全不存在的话', hook_score: 8 }];
    const srt = `1\n00:00:00,500 --> 00:00:02,000\n你好世界\n`;
    const result = matchHooksToSRT(quotes, srt, { maxCount: 4 });
    assert.strictEqual(result.segments.length, 0);
  });
});
```

- [ ] **Step 3: Implement capabilities/hook/index.js**

Orchestration: find SRT (from outputDir or transcribe) -> AI select quotes via `callClaude` -> `matchHooksToSRT` -> FFmpeg cut each segment (H.264) -> concat via demuxer -> output hooks.json + hook.mp4 + hook_segments/.

- [ ] **Step 4: Create SKILL.md**

- [ ] **Step 5: Run test, verify passes, commit**

```bash
git add capabilities/hook/ tests/capabilities/hook.test.js
git commit -m "feat: add hook capability"
```

---

## Task 10: Clip Capability

**Files:**
- Create: `capabilities/clip/index.js`
- Create: `capabilities/clip/split.sh`
- Create: `capabilities/clip/SKILL.md`
- Create: `tests/capabilities/clip.test.js`

- [ ] **Step 1: Write test**

```js
// tests/capabilities/clip.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseChapters } = require('../../capabilities/clip/index');

describe('clip', () => {
  it('parseChapters() extracts chapters from AI output', () => {
    const chapters = parseChapters([
      { title: 'Intro', start: '00:00', end: '02:30', summary: 'Introduction' },
      { title: 'Main', start: '02:30', end: '05:00', summary: 'Main point' },
    ]);
    assert.strictEqual(chapters.length, 2);
    assert.strictEqual(chapters[0].startSec, 0);
    assert.strictEqual(chapters[1].endSec, 300);
  });
});
```

- [ ] **Step 2: Create split.sh**

FFmpeg segment cutting: `-ss $START -i input -t $DURATION` with H.264 output.

- [ ] **Step 3: Implement capabilities/clip/index.js**

Export `parseChapters(raw)` (timestamp parsing) and `run()` orchestration: transcribe -> AI chapter analysis via `callClaude` -> FFmpeg split each chapter.

- [ ] **Step 4: Create SKILL.md**

- [ ] **Step 5: Run test, verify passes, commit**

```bash
git add capabilities/clip/ tests/capabilities/clip.test.js
git commit -m "feat: add clip capability"
```

---

## Task 11: Cover Capability

**Files:**
- Create: `capabilities/cover/index.js`
- Copy: `generate-cards.sh` to `capabilities/cover/generate.sh`
- Create: `capabilities/cover/SKILL.md`
- Create: `tests/capabilities/cover.test.js`

- [ ] **Step 1: Copy existing script**

```bash
mkdir -p capabilities/cover/templates
cp generate-cards.sh capabilities/cover/generate.sh
chmod +x capabilities/cover/generate.sh
```

- [ ] **Step 2: Write test and implement index.js**

Orchestration: read quotes from hooks.json or --text flag -> write temp quotes JSON -> shell out to `generate.sh` -> return card paths.

- [ ] **Step 3: Create SKILL.md**

- [ ] **Step 4: Run test, verify passes, commit**

```bash
git add capabilities/cover/ tests/capabilities/cover.test.js
git commit -m "feat: add cover capability"
```

---

## Task 12: Pipeline

**Files:**
- Create: `pipeline.js`
- Create: `tests/pipeline.test.js`

- [ ] **Step 1: Write test**

```js
// tests/pipeline.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseSteps } = require('../pipeline');

describe('pipeline', () => {
  it('parseSteps() splits comma-separated steps', () => {
    assert.deepStrictEqual(parseSteps('autocut,subtitle,hook'), ['autocut', 'subtitle', 'hook']);
  });

  it('parseSteps() rejects unknown steps', () => {
    assert.throws(() => parseSteps('autocut,bogus'), /Unknown capability: bogus/);
  });
});
```

- [ ] **Step 2: Implement pipeline.js**

```js
// pipeline.js
const fs = require('node:fs');
const path = require('node:path');

const VALID_STEPS = ['transcribe', 'autocut', 'subtitle', 'hook', 'clip', 'cover', 'speed'];

function parseSteps(stepsStr) {
  const steps = stepsStr.split(',').map(s => s.trim());
  for (const s of steps) {
    if (!VALID_STEPS.includes(s)) throw new Error(`Unknown capability: ${s}`);
  }
  return steps;
}

async function run({ input, outputDir, options = {} }) {
  const steps = parseSteps(options.steps || '');
  if (steps.length === 0) throw new Error('No steps specified. Use --steps autocut,subtitle,...');

  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`Pipeline: ${steps.join(' -> ')}`);
  console.log(`Output: ${outputDir}\n`);

  let currentInput = input;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n[${i + 1}/${steps.length}] ${step.toUpperCase()}`);

    const capability = require(`./capabilities/${step}/index`);
    const result = await capability.run({
      input: currentInput,
      outputDir,
      options,
    });

    if (result.video) {
      currentInput = result.video;
    }
  }

  console.log(`\nPipeline complete: ${outputDir}`);
}

module.exports = { run, parseSteps };
```

- [ ] **Step 3: Run test, verify passes, commit**

```bash
git add pipeline.js tests/pipeline.test.js
git commit -m "feat: add pipeline — chain capabilities"
```

---

## Task 13: Integration Test

**Files:**
- Create: `tests/integration.test.js`

- [ ] **Step 1: Write integration test**

Test with a synthetic 2-second test video: verify CLI help output, verify speed capability produces output file, verify pipeline parseSteps works.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 3: Verify directory structure**

```bash
ls capabilities/*/index.js capabilities/*/SKILL.md lib/*.js cli.js pipeline.js package.json
```

Expected: 7 index.js + 7 SKILL.md + 3 lib files + cli.js + pipeline.js + package.json

- [ ] **Step 4: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: add integration test"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | lib/ffmpeg.js | 1 |
| 2 | lib/srt.js | 1 |
| 3 | lib/claude.js | 1 |
| 4 | CLI + package.json | 1 |
| 5 | Transcribe | 1 |
| 6 | AutoCut | 1 |
| 7 | Subtitle | 1 |
| 8 | Speed | 1 |
| 9 | Hook | 1 |
| 10 | Clip | 1 |
| 11 | Cover | 1 |
| 12 | Pipeline | 1 |
| 13 | Integration test | 1 |
| **Total** | **~47 files** | **13 commits** |
