'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { callClaude, parseAIOutput } = require('../../lib/claude');

const SILENCE_THRESHOLD_SEC = 0.5;
const MERGE_GAP_SEC = 0.05;
const cutScript = path.join(__dirname, 'cut.sh');
const rulesDir = path.join(__dirname, 'rules');

/**
 * Convert word indices to time ranges, sort by start, and merge segments
 * that are within MERGE_GAP_SEC of each other.
 *
 * @param {object[]} words - word-level transcript array (each has start, end)
 * @param {number[]} selectedIndices - indices into words array to delete
 * @returns {{ start: number, end: number }[]} merged delete segments
 */
function buildDeleteSegments(words, selectedIndices) {
  if (!selectedIndices || selectedIndices.length === 0) return [];

  // Build raw time ranges from indices
  const ranges = selectedIndices
    .filter((i) => i >= 0 && i < words.length)
    .map((i) => ({ start: words[i].start, end: words[i].end }));

  if (ranges.length === 0) return [];

  // Sort by start time
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);

  // Merge segments within MERGE_GAP_SEC of each other
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start - last.end <= MERGE_GAP_SEC) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }

  return merged;
}

/**
 * Build a feedback summary object.
 *
 * @param {number[]} silenceIndices - word indices removed due to silence
 * @param {number[]} aiIndices - word indices removed by AI
 * @returns {{ timestamp: string, silence_count: number, ai_count: number, total_count: number, silence_indices: number[], ai_indices: number[] }}
 */
function buildFeedback(silenceIndices, aiIndices) {
  const silence = silenceIndices || [];
  const ai = aiIndices || [];

  // Deduplicated total
  const allIndices = [...new Set([...silence, ...ai])];

  return {
    timestamp: new Date().toISOString(),
    silence_count: silence.length,
    ai_count: ai.length,
    total_count: allIndices.length,
    silence_indices: silence.slice(),
    ai_indices: ai.slice(),
  };
}

/**
 * Load all .md files from the rules directory and concatenate them.
 *
 * @returns {string} concatenated rules content
 */
function loadRules() {
  if (!fs.existsSync(rulesDir)) return '';

  const files = fs
    .readdirSync(rulesDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files
    .map((f) => fs.readFileSync(path.join(rulesDir, f), 'utf8'))
    .join('\n\n');
}

/**
 * Build a human-readable transcript for AI analysis.
 *
 * @param {object[]} words
 * @returns {{ readable: string, sentences: string }}
 */
function buildTranscriptTexts(words) {
  const readableLines = words
    .map((w, i) => {
      const time = `${w.start.toFixed(2)}-${w.end.toFixed(2)}`;
      return `${i}|${w.text}|${time}`;
    })
    .join('\n');

  const sentences = words.map((w) => w.text).join('');

  return { readable: readableLines, sentences };
}

/**
 * Find all gap indices where the gap before word[i] is >= SILENCE_THRESHOLD_SEC.
 *
 * @param {object[]} words
 * @returns {number[]} indices of words that follow a silence gap
 */
function detectSilenceIndices(words) {
  const indices = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= SILENCE_THRESHOLD_SEC) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Run the autocut pipeline:
 * 1. Transcribe input video
 * 2. Detect silence gaps
 * 3. Ask Claude for filler/stutter indices
 * 4. Merge, build delete segments
 * 5. Shell out to cut.sh
 * 6. Write artifacts
 *
 * @param {object} params
 * @param {string} params.input     - path to input video
 * @param {string} params.outputDir - directory to write output artifacts
 * @param {object} [params.options]
 * @returns {Promise<{ video: string, artifacts: { feedback: string } }>}
 */
async function run({ input, outputDir, options = {} }) {
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Transcribe
  const transcribe = require('../transcribe/index');
  const { words } = await transcribe.run({ input, outputDir, options });

  // Step 2: Silence detection
  const silenceIndices = detectSilenceIndices(words);

  // Step 3: Build text representations
  const { readable, sentences } = buildTranscriptTexts(words);
  const readablePath = path.join(outputDir, 'readable.txt');
  const sentencesPath = path.join(outputDir, 'sentences.txt');
  fs.writeFileSync(readablePath, readable, 'utf8');
  fs.writeFileSync(sentencesPath, sentences, 'utf8');

  // Step 4: Load rules
  const rules = loadRules();

  // Step 5: Ask Claude for deletion indices
  const prompt = `${rules}

---

以下是口播逐词转录（格式：序号|词|开始-结束秒）：

${readable}

---

请根据以上规则，分析上述转录，找出所有需要删除的词的序号（包括口误、语气词、卡顿、重复、残句等）。

只返回一个 JSON 数组，包含需要删除的序号，例如：[0, 3, 7, 12]

不要包含任何解释文字，只返回 JSON 数组。`;

  const aiIndices = await callClaude(prompt, { parser: parseAIOutput });

  const validAiIndices = Array.isArray(aiIndices)
    ? aiIndices.filter((i) => typeof i === 'number' && i >= 0 && i < words.length)
    : [];

  // Step 6: Merge silence + AI indices, dedup, sort
  const allIndices = [...new Set([...silenceIndices, ...validAiIndices])].sort(
    (a, b) => a - b
  );

  // Step 7: Build delete segments and write to file
  const deleteSegments = buildDeleteSegments(words, allIndices);
  const deleteSegmentsPath = path.join(outputDir, 'delete_segments.json');
  fs.writeFileSync(deleteSegmentsPath, JSON.stringify(deleteSegments, null, 2), 'utf8');

  // Step 8: Shell out to cut.sh
  const ext = path.extname(input) || '.mp4';
  const outputPath = path.join(outputDir, `cut${ext}`);

  await execFileAsync('bash', [cutScript, input, deleteSegmentsPath, outputPath]);

  // Step 9: Write feedback
  const feedback = buildFeedback(silenceIndices, validAiIndices);
  const feedbackPath = path.join(outputDir, 'cut_feedback.json');
  fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), 'utf8');

  return {
    video: outputPath,
    artifacts: {
      feedback: feedbackPath,
    },
  };
}

module.exports = { run, buildDeleteSegments, buildFeedback };
