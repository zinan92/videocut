# Subtitle Capability

## Name
subtitle

## Description
Detect hardcoded subtitles and, if absent, transcribe the video and burn fresh subtitles into it. Subtitles are always generated from the input video directly — no time offset adjustments needed. Use after autocut to get accurate subtitles on the final cut.

## Prerequisites
- **FFmpeg** with libass support (for subtitle filter)
- **Whisper** (via `capabilities/transcribe`) for audio transcription
- **Node.js** 18+

## Usage

```js
const { run } = require('./capabilities/subtitle');

// Default: detect → transcribe → burn
const result = await run({
  input: '/path/to/cut_video.mp4',
  outputDir: '/path/to/output',
  options: {}
});
// result.video → burned video path

// Skip burning, return SRT only
const srtOnly = await run({
  input: '/path/to/cut_video.mp4',
  outputDir: '/path/to/output',
  options: { 'no-burn': true }
});
// srtOnly.video → original input path
// srtOnly.srt   → path to generated subtitle.srt
```

## Options

| Option     | Type    | Default | Description                              |
|------------|---------|---------|------------------------------------------|
| `no-burn`  | boolean | false   | Skip FFmpeg burn step, return SRT only   |
| `model`    | string  | 'small' | Whisper model size (passed to transcribe)|

## Input / Output

**Input:** Any video file supported by FFmpeg (`.mp4`, `.mov`, etc.)

**Output:**

| Field              | Description                                           |
|--------------------|-------------------------------------------------------|
| `result.video`     | Path to subtitled video (or original if skipped)      |
| `result.srt`       | Path to generated `subtitle.srt` (if subtitles added) |
| `result.artifacts` | `{ srtPath }` object                                  |

## Flow

```
run(input, outputDir, options)
  │
  ├─ [1] Validate input exists
  │
  ├─ [2] detect.js → analyse bottom 15% of mid-frame pixels
  │       └─ stdout "true"  → already has subtitles → return { video: input }
  │       └─ stdout "false" → continue
  │
  ├─ [3] transcribe/index.run() → { words }
  │
  ├─ [4] wordsToSRT(words) + generateSRT(entries) → write subtitle.srt
  │
  ├─ [5] options['no-burn']?
  │       └─ yes → return { video: input, srt, artifacts }
  │
  └─ [6] burn.sh <input> <subtitle.srt> <output_subtitled.mp4>
          └─ return { video: outputVideo, srt, artifacts }
```

## Notes

- **Re-transcription approach:** Subtitle always transcribes the given input video fresh. If you pass a post-autocut video, the timing is perfectly aligned with no offset needed.
- **Hardcoded subtitle detection:** Uses brightness analysis on the bottom 15% of mid-video frames. If >2% of pixels in that region exceed brightness threshold 200, subtitles are assumed present and the step is skipped.
- **Burn style:** PingFang SC font, 22pt, white text with black outline, bottom-aligned with 30px margin.
- **SRT path:** Always written to `<outputDir>/subtitle.srt`.
- **Output video path:** `<outputDir>/<input_basename>_subtitled.mp4`.
