# hook

AI-powered hook video generator: selects the most compelling quotes from a spoken-word video, matches them to precise SRT timestamps, and cuts + concatenates them into a single hook clip for short-video platforms.

## Prerequisites

- FFmpeg installed at `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` (or override with `FFMPEG_PATH`)
- Claude CLI available (`claude` on PATH, or override with `CLAUDE_PATH`)
- Whisper transcription available (used when no SRT exists in outputDir)

## Usage

```bash
# Basic usage — up to 4 hooks, each ≤ 10 s
videocut hook --input ./recording.mp4 --output-dir ./out

# Custom count and max duration
videocut hook --input ./recording.mp4 --output-dir ./out --count 3 --max-duration 8

# Strict mode — preserve AI quote order, skip auto-filtering
videocut hook --input ./recording.mp4 --output-dir ./out --strict
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--count` | 4 | Maximum number of hook segments |
| `--max-duration` | 10 | Maximum duration per segment (seconds) |
| `--strict` | false | Preserve AI quote order; error on any match failure |

## Input / Output

**Input:**
- `input` — path to source video (any format FFmpeg can read)
- `outputDir` — directory for all outputs; if `subtitle.srt` or `transcript.srt` already exists there, transcription is skipped

**Output:**
- `outputDir/3_hook.mp4` — concatenated hook video (H.264 / AAC)
- `outputDir/hooks.json` — AI-selected quotes with scores and categories
- Returns `{ video, json, artifacts }` when used as a module

## Flow

```
input video
    │
    ▼
[1] Find SRT in outputDir
    └─ not found → transcribe (Whisper)
    │
    ▼
[2] AI quote selection (Claude)
    → 6-8 quotes with original_text, hook_score, category
    → write hooks.json
    │
    ▼
[3] matchHooksToSRT()
    → character-level text matching against SRT full-text
    → fuzzy fallback (≥ 50% prefix match)
    → filter by maxDuration, speech speed (≥ 80% avg), overlap
    → auto-expand segments < 3 s
    → suspense cut on last segment (−0.5 s if > 3 s)
    │
    ▼
[4] FFmpeg cut each segment (H.264 re-encode)
    │
    ▼
[5] FFmpeg concat (stream copy via concat demuxer)
    → 3_hook.mp4
```
