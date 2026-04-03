---
name: videocut
description: AI-powered video editing — transcribe, autocut, subtitle, hook, clip, cover, speed, pipeline. Read this to know WHEN and HOW to use videocut.
---

# Videocut

AI-powered video editing capabilities for spoken-word content. Seven independent tools plus a pipeline mode for chaining them.

## When to Use

Use `videocut` when the user has a **video file** and wants to **edit, transcribe, or produce content from it**.

| User says | Action |
|-----------|--------|
| "转录 / transcribe this video" | `videocut transcribe input.mp4 -o output/` |
| "去口癖 / 去废话 / remove fillers" | `videocut autocut input.mp4 -o output/` |
| "加字幕 / burn subtitles" | `videocut subtitle input.mp4 -o output/` |
| "提取金句 / find hooks" | `videocut hook input.mp4 -o output/` |
| "拆成短视频 / split into clips" | `videocut clip input.mp4 -o output/` |
| "做封面 / generate quote cards" | `videocut cover -o output/ --text "金句"` |
| "加速 / speed up" | `videocut speed input.mp4 -o output/ --rate 1.1` |
| "一条龙 / full production" | `videocut pipeline input.mp4 --steps autocut,subtitle,hook -o output/` |

## When NOT to Use

| User wants | Use instead |
|------------|-------------|
| Download a video from URL | `content-downloader` |
| Extract text from downloaded content (structured) | `content-extractor` |
| Rewrite content for another platform | `content-rewriter` |
| Analyze content trends | `content-intelligence` |

## Sub-Capabilities

### transcribe
Transcribe video/audio to text with word-level timestamps.
- **Input:** Video/audio file
- **Output:** `transcript.json` (word-level), `transcript.txt`, `transcript.srt`
- **AI:** Whisper only (no Claude)

### autocut
Remove filler words, stutters, and dead air from spoken-word video.
- **Input:** Video file
- **Output:** `cut.mp4`, `delete_segments.json`, `cut_feedback.json`
- **AI:** Whisper + Claude (9 extensible rule files for analysis)

### subtitle
Detect existing hardcoded subtitles or generate and burn new ones.
- **Input:** Video file
- **Output:** `subtitled.mp4`, `subtitle.srt`
- **AI:** Whisper for transcription

### hook
Extract the most engaging quotes and cut corresponding video segments.
- **Input:** Video file
- **Output:** `hook.mp4` (concatenated), `hooks.json`, `hook_segments/*.mp4`
- **AI:** Claude selects quotes, character-level text matching

### clip
Split long video into chapters based on topic changes.
- **Input:** Video file
- **Output:** `clips/*.mp4`, `chapters.json`
- **AI:** Claude detects chapter boundaries

### cover
Generate quote card images from hooks or custom text.
- **Input:** `hooks.json` or `--text` flag
- **Output:** `card_1.png ... card_N.png` (1080x1080)
- **AI:** None (Chrome Headless rendering)

### speed
Speed up video with pitch-preserving audio adjustment.
- **Input:** Video file + rate (1.0–1.2x recommended)
- **Output:** `speed.mp4`
- **AI:** None (FFmpeg atempo filter)

## Pipeline Mode

Chain multiple sub-capabilities in sequence:

```bash
videocut pipeline input.mp4 --steps autocut,speed,subtitle,hook,cover -o output/
```

### Recommended Order

```
autocut → speed → subtitle → hook → clip → cover
```

- **autocut** first: cut filler before anything else
- **speed** before subtitle: subtitles generated against final-speed video
- **subtitle** before hook: hook can reuse the SRT file
- **cover** last: needs hooks.json from hook step

## CLI Reference

```bash
videocut <capability> <input> [OPTIONS]
```

### Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-o` / `--output` | `./output/{date}_{basename}/` | Output directory |
| `--no-review` | False | Skip interactive review (autocut) |

### Capability-Specific Flags

| Capability | Flag | Default | Description |
|-----------|------|---------|-------------|
| hook | `--count` | 5 | Number of hooks to extract |
| speed | `--rate` | 1.1 | Speed multiplier (1.0–1.2) |
| pipeline | `--steps` | required | Comma-separated capability list |
| autocut | `--model` | — | Claude model override |

## Architecture

```
cli.js (argument parser + router)
  → capabilities/{name}/index.js (per-capability orchestrator)
    → lib/ffmpeg.js (video probing, audio extraction)
    → lib/srt.js (SRT parsing, generation, merging)
    → lib/claude.js (Claude CLI wrapper with retry)
    → capabilities/{name}/*.sh (FFmpeg operations)
```

Each sub-capability is a self-contained directory with its own `index.js`, bash scripts, and `SKILL.md`.

## Dependencies

- Node.js 18+
- FFmpeg (with libass for subtitle burning)
- Whisper (`pip install openai-whisper`)
- Claude CLI (authenticated, on PATH)
- Chrome/Chromium (for cover generation only)

## Failure Modes

| Failure | Behavior |
|---------|----------|
| Input file not found | Exit 1 with error message |
| Unknown capability | Exit 1 with supported capability list |
| FFmpeg error | Exit with FFmpeg stderr |
| Claude API error | Retry with exponential backoff (1s, 3s, 9s) |
| Whisper failure | Exit with transcription error |

## Pipeline Position

```
content-downloader → videocut (standalone video editing)
                   → content-extractor → content-rewriter
```

Videocut operates independently on video files. It does not require content-downloader output — any video file works.
