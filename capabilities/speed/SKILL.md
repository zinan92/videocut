---
name: speed
description: Intelligent speed adjustment (1.1x-1.2x) for spoken-word video
allowed-tools:
  - Read
  - Write
  - Bash
---

# Speed

## Prerequisites
- FFmpeg installed

## Usage
videocut speed <input.mp4> -o output/ [--rate 1.1]

## Input
- A video file (.mp4, .mov)

## Output
- speed.mp4 — Speed-adjusted video

## Notes
- Default rate: 1.1x
- Maximum rate: 1.2x (hard cap)
- Audio pitch preserved via atempo filter
