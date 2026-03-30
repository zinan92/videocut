---
name: transcribe
description: Speech-to-text transcription using Whisper with word-level timestamps
allowed-tools:
  - Read
  - Write
  - Bash
---

# Transcribe

## Prerequisites
- FFmpeg installed
- Whisper installed (`pip install openai-whisper`)

## Usage
videocut transcribe <input.mp4> -o output/ [--model small]

## Input
- A video or audio file (.mp4, .mov, .mp3)

## Output
- transcript.json — Word-level JSON with timestamps
- transcript.txt — Plain text
- transcript.srt — SRT subtitles

## Flow
1. Extract audio from video (FFmpeg)
2. Run Whisper transcription
3. Convert to canonical word-level format
4. Generate plain text and SRT

## Options
- `--model <size>` — Whisper model (default: small)
