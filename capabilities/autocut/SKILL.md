# autocut

Automatically removes filler words, stutters, repeated phrases, and silence gaps from a spoken-word video using Whisper transcription and Claude AI analysis.

## Description

`autocut` orchestrates a full AI-powered editing pass on raw recordings:

1. Transcribes the video with Whisper (word-level timestamps)
2. Detects silence gaps ≥ 0.5s automatically
3. Asks Claude to identify filler words, stutters, false starts, and repeated sentences using customizable rules
4. Merges AI suggestions with silence detections and deduplicates
5. Builds precise `delete_segments.json` with time ranges
6. Shells out to `cut.sh` (FFmpeg) for frame-accurate cutting with audio crossfade

## Prerequisites

- **FFmpeg** — video cutting and audio extraction
- **Whisper** — speech-to-text with word-level timestamps (`whisper.cpp` or `faster-whisper`)
- **Claude CLI** — AI analysis of transcript (`claude` on PATH or `CLAUDE_PATH` env var)

## Input / Output

**Input:**
```js
run({
  input: '/path/to/recording.mp4',  // required — source video
  outputDir: '/path/to/output/',    // required — artifacts destination
  options: {
    model: 'small'                  // optional — Whisper model size (default: 'small')
  }
})
```

**Output:**
```js
{
  video: '/path/to/output/cut.mp4',          // edited video
  artifacts: {
    feedback: '/path/to/output/cut_feedback.json'  // deletion statistics
  }
}
```

**Artifacts written to `outputDir`:**

| File | Description |
|------|-------------|
| `transcript.json` | Word-level transcript (from transcribe capability) |
| `transcript.txt` | Plain text transcript |
| `transcript.srt` | SRT subtitles |
| `readable.txt` | `idx\|word\|start-end` — sent to Claude |
| `sentences.txt` | Plain concatenated text |
| `delete_segments.json` | `[{start, end}]` time ranges to cut |
| `cut_feedback.json` | Deletion statistics |
| `cut.mp4` | Final edited video |

## Usage

```js
const autocut = require('./capabilities/autocut');

const result = await autocut.run({
  input: 'recording.mp4',
  outputDir: 'output/session1'
});

console.log('Edited video:', result.video);
```

## Pipeline Flow

```
input.mp4
  └─ transcribe/index.js → words[]
       └─ silence detection (gaps ≥ 0.5s)
       └─ build readable.txt + sentences.txt
       └─ load rules/*.md
       └─ callClaude() → AI deletion indices[]
            └─ merge + dedup (silence ∪ AI)
            └─ buildDeleteSegments() → [{start, end}]
            └─ write delete_segments.json
            └─ bash cut.sh → cut.mp4
            └─ write cut_feedback.json
```

## Exported Helper Functions

### `buildDeleteSegments(words, selectedIndices)`

Convert word indices to time ranges and merge segments within 0.05s of each other.

```js
const { buildDeleteSegments } = require('./capabilities/autocut');

const segments = buildDeleteSegments(words, [0, 3, 7]);
// → [{ start: 0.0, end: 0.3 }, { start: 1.5, end: 2.1 }]
```

### `buildFeedback(silenceIndices, aiIndices)`

Build a feedback summary with counts and deduplicated totals.

```js
const { buildFeedback } = require('./capabilities/autocut');

const feedback = buildFeedback([1, 3], [2, 4]);
// → { timestamp, silence_count: 2, ai_count: 2, total_count: 4, ... }
```

## Customization

To tune the AI's deletion criteria, add or edit Markdown files in `capabilities/autocut/rules/`:

| File | Purpose |
|------|---------|
| `1-核心原则.md` | Core deletion principles |
| `2-语气词检测.md` | Filler word detection |
| `3-静音段处理.md` | Silence handling |
| `4-重复句检测.md` | Repeated sentence detection |
| `5-卡顿词.md` | Stutter/hesitation words |
| `6-句内重复检测.md` | In-sentence repetition |
| `7-连续语气词.md` | Consecutive filler runs |
| `8-重说纠正.md` | Self-correction detection |
| `9-残句检测.md` | Incomplete sentence detection |

All `.md` files in `rules/` are loaded alphabetically and concatenated into the Claude prompt. Add a new `.md` file to extend the ruleset without modifying any code.
