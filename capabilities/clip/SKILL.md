---
name: clip
description: AI-driven chapter detection and video clipping with FFmpeg
allowed-tools:
  - Read
  - Write
  - Bash
---

# Clip

## Prerequisites
- FFmpeg installed
- Whisper installed (`pip install openai-whisper`)
- Claude CLI available (`claude` in PATH)

## Usage
```
videocut clip <input.mp4> -o output/ [--min-duration <sec>] [--max-duration <sec>] [--all]
```

## Options
- `--min-duration <sec>` — Skip clips shorter than this duration (seconds)
- `--max-duration <sec>` — Skip clips longer than this duration (seconds)
- `--all` — Include all detected chapters, ignoring duration filters

## Input
- A video file (.mp4, .mov, .mkv)

## Output
- `transcript.txt` — Plain text transcript (from transcribe step)
- `chapters.json` — AI-detected chapters with title, timestamps, summary, keywords, and output file paths
- `clips/` — Directory containing individual chapter video files (MP4, H.264)

## Flow
1. Transcribe audio via Whisper (word-level timestamps)
2. Read transcript text
3. AI chapter analysis via Claude — detects 2-5 minute chapters with titles, summaries, keywords
4. Parse and validate chapter timestamps
5. Apply optional duration filters
6. Cut each chapter to a separate MP4 using FFmpeg (H.264 fast preset, CRF 18, AAC 192k)

## Examples
```bash
# Basic usage
videocut clip recording.mp4 -o output/

# Only clips between 2 and 10 minutes
videocut clip recording.mp4 -o output/ --min-duration 120 --max-duration 600

# Include all chapters regardless of duration
videocut clip recording.mp4 -o output/ --all
```
