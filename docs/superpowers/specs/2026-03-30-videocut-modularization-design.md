# Videocut Modularization Design

**Date:** 2026-03-30
**Status:** Draft
**Author:** Wendy + Claude

## Goal

Refactor videocut from a monolithic pipeline (run.sh + content-repurpose.sh) into 7 independent capabilities that can be called individually via CLI or chained via pipeline. Each capability is also a Claude Code skill (SKILL.md) so other agents can use them.

## Architecture: Mixed Node.js + Bash (Option C)

- **Node.js** handles: CLI entry, orchestration, data processing (JSON, SRT, AI calls)
- **Bash** handles: FFmpeg commands, Whisper invocation
- Boundary is clean: `.js` files never shell out raw FFmpeg commands inline; `.sh` files never process JSON

### Why not pure Bash (A) or pure Node (B)?

The codebase already mixes both — run.sh has 6 inline `node -e` blocks because Bash can't handle JSON/SRT processing. Option C formalizes this existing split with clean boundaries instead of inline mixing.

## Directory Structure

```
videocut/
├── cli.js                          # Unified entry: node cli.js <capability> [args]
├── capabilities/
│   ├── transcribe/
│   │   ├── index.js                # Orchestration: call whisper.sh → output words.json
│   │   ├── whisper.sh              # From: 剪口播/scripts/whisper_transcribe.sh
│   │   └── SKILL.md
│   ├── autocut/
│   │   ├── index.js                # AI analysis + generate delete list + call cut.sh
│   │   ├── cut.sh                  # From: 剪口播/scripts/cut_video.sh
│   │   ├── rules/                  # From: 剪口播/用户习惯/*.md
│   │   └── SKILL.md
│   ├── subtitle/
│   │   ├── index.js                # Detect → Transcribe → generate SRT → burn
│   │   ├── detect.js              # From: 剪口播/scripts/detect_hardcoded_subtitles.js
│   │   ├── burn.sh                # FFmpeg subtitle burn command
│   │   └── SKILL.md
│   ├── hook/
│   │   ├── index.js               # AI select quotes → SRT text match → cut clips
│   │   ├── match.js               # From: ceo-donald/videocut/lib/hook-segments.js
│   │   ├── concat.js              # From: ceo-donald/videocut/lib/hook-concat.js
│   │   └── SKILL.md
│   ├── clip/
│   │   ├── index.js               # AI chapter analysis → user select → split
│   │   ├── split.sh              # FFmpeg segment cutting
│   │   └── SKILL.md
│   ├── cover/
│   │   ├── index.js               # Read quotes → HTML render → Chrome screenshot
│   │   ├── generate.sh           # From: generate-cards.sh
│   │   ├── templates/            # Card HTML templates
│   │   └── SKILL.md
│   └── speed/
│       ├── index.js               # Analyze duration → suggest rate → adjust
│       ├── adjust.sh             # FFmpeg atempo + setpts
│       └── SKILL.md
├── lib/
│   ├── srt.js                     # SRT parse/generate/merge (from generate_srt.js + merge-srt-for-douyin.js)
│   ├── ffmpeg.js                  # child_process FFmpeg wrapper with error handling
│   └── claude.js                  # AI call + retry (from content-repurpose.sh retry_claude)
├── pipeline.js                    # Chain capabilities: videocut pipeline input.mp4 --steps autocut,subtitle,hook
├── package.json
└── README.md
```

### What stays untouched

- `web/` — Dashboard. Will later call capability index.js files, but not in this scope.
- `content-repurpose.sh` — Belongs to content pipeline step 05 (content-rewriter), not video editing.
- `publish.sh` — Belongs to step 07 (content-publisher), not step 06.

## Capabilities

### 1. Transcribe

**Purpose:** Speech → text (foundation for other capabilities)

```
Input:  video.mp4
Output: transcript.json   — Whisper word-level JSON with timestamps
        transcript.txt    — Plain text
        transcript.srt    — SRT subtitles
```

**CLI:** `videocut transcribe input.mp4 -o output/ [--model small]`

**Internal:** Extract audio (FFmpeg) → Whisper transcribe → Generate SRT from word-level JSON

### 2. AutoCut

**Purpose:** Remove filler words, stutters, silence from spoken-word video

```
Input:  video.mp4
Output: cut.mp4            — Edited video
        cut_feedback.json  — What was deleted, why, confidence scores
```

**CLI:** `videocut autocut input.mp4 -o output/ [--no-review] [--model small]`

**Internal:** Transcribe → Silence detection (≥0.5s gaps) → AI stutter analysis (Claude + rules/*.md) → Optional review server → FFmpeg cut

**AI analysis rules** live in `capabilities/autocut/rules/`. Users can add custom .md rule files — AI reads all files in the directory. Existing rules:
- 1-核心原则.md, 2-语气词检测.md, 3-静音段处理.md, 4-重复句检测.md
- 5-卡顿词.md, 6-句内重复检测.md, 7-连续语气词.md, 8-重说纠正.md, 9-残句检测.md

**Feedback loop:** `cut_feedback.json` records AI decisions with confidence. When user corrects via review server, corrections are stored and fed back to AI in future runs via `rules/feedback_examples.md`.

### 3. Subtitle

**Purpose:** Detect existing subtitles; if none, generate and burn onto video

```
Input:  video.mp4
Output: subtitled.mp4  — Video with burned subtitles
        subtitle.srt   — SRT file
```

**CLI:** `videocut subtitle input.mp4 -o output/ [--style default] [--no-burn]`

**Internal:** Detect hardcoded subtitles (frame analysis) → If found, skip. If not: Transcribe the input video → Generate SRT → FFmpeg burn with configurable style.

**Key design decision:** Subtitle always transcribes the input video directly — no time offset needed. Typical flow is `autocut → subtitle`, where subtitle receives the already-cut video and generates fresh subtitles against it.

**Subtitle style** defaults to PingFang SC 22pt white with black outline. Future: configurable via `--style` flag or style presets.

### 4. Hook

**Purpose:** Extract memorable quotes as text + video clips

```
Input:  video.mp4, transcript.srt (optional)
Output: hooks.json          — Quote list with text, time range, hook_score
        hook.mp4            — Concatenated hook video
        hook_segments/      — Individual quote video clips
```

**CLI:** `videocut hook input.mp4 -o output/ [--count 4] [--max-duration 10]`

**Internal:** Transcribe (if no SRT provided) → AI selects 6-8 quotes with hook_score → Text matching against SRT to find exact timestamps (character-level matching with fuzzy fallback) → Filter by duration/speed/overlap → FFmpeg cut each segment (H.264) → Concat via demuxer

**From CEO Donald's proven code:**
- `hook-segments.js` — Character-level SRT text matching, speed filtering, auto-expand segments < 3s, suspense cut on last segment
- `hook-concat.js` — H.264 uniform encoding, probe source bitrate/resolution, concat demuxer

### 5. Clip

**Purpose:** Split long video into short chapter-based clips

```
Input:  video.mp4
Output: chapters.json       — Chapter list with title, time range, summary, keywords
        clips/
          01_chapter_title.mp4
          02_chapter_title.mp4
          ...
```

**CLI:** `videocut clip input.mp4 -o output/ [--min-duration 120] [--max-duration 300]`

**Internal:** Transcribe → AI chapter analysis (2-5 minute granularity, semantic topic boundaries) → Interactive chapter selection (or `--all`) → FFmpeg segment cutting

**Reference:** youtube-clipper-skill's approach to chapter analysis. SplitPage.tsx backend logic for FFmpeg splitting.

### 6. Cover

**Purpose:** Generate thumbnail and quote cards

```
Input:  hooks.json or manual quote text
Output: cover.png       — 1280×720 thumbnail
        card_1.png      — 1080×1080 quote cards
        card_2.png
        ...
```

**CLI:** `videocut cover -o output/ [--quotes hooks.json] [--text "手动输入金句"]`

**Internal:** Read quotes → Render HTML template → Chrome Headless screenshot → Output PNG

**Max 5 cards per run** (current limit in generate-cards.sh).

### 7. Speed

**Purpose:** Intelligent speed adjustment (1.1x - 1.2x)

```
Input:  video.mp4
Output: speed.mp4   — Speed-adjusted video
```

**CLI:** `videocut speed input.mp4 -o output/ [--rate 1.1]`

**Internal:** Analyze video duration → Suggest rate (1.1x default, 1.2x max) → FFmpeg `atempo` (audio) + `setpts` (video)

**Note:** 1.2x is already noticeably fast for spoken word. Do not exceed 1.2x by default.

## Pipeline Mode

Chain capabilities in sequence:

```bash
videocut pipeline input.mp4 --steps autocut,subtitle,hook,cover
```

`pipeline.js` passes each step's output as the next step's input. Steps run in declared order. If a step fails, pipeline stops and reports which step failed.

**Common chains:**
- `autocut,subtitle` — Cut then add subtitles (most common)
- `autocut,subtitle,hook,cover` — Full production
- `hook` — Just extract hooks from raw video
- `clip` — Just split into chapters

## SKILL.md Format

Every capability has a SKILL.md with this structure:

```markdown
---
name: <capability>
description: <one-line description>
allowed-tools:
  - Read
  - Write
  - Bash
---

# <Capability Name>

## Prerequisites
- FFmpeg installed
- Whisper installed (for capabilities that need transcription)

## Usage
videocut <capability> <input> [-o output_dir] [flags]

## Input
- What it expects

## Output
- What it produces

## Flow
1. Step-by-step process

## Customization
- How users can extend (e.g., add rules to autocut/rules/)
```

## Code Migration Map

### Move as-is (rename only)

| Source | Destination |
|--------|------------|
| `剪口播/scripts/whisper_transcribe.sh` | `capabilities/transcribe/whisper.sh` |
| `剪口播/scripts/cut_video.sh` | `capabilities/autocut/cut.sh` |
| `剪口播/scripts/detect_hardcoded_subtitles.js` | `capabilities/subtitle/detect.js` |
| `剪口播/用户习惯/*.md` | `capabilities/autocut/rules/` |
| `generate-cards.sh` | `capabilities/cover/generate.sh` |

### Move from CEO Donald

| Source | Destination | Changes |
|--------|------------|---------|
| `ceo-donald/videocut/lib/hook-segments.js` | `capabilities/hook/match.js` | Modularize exports |
| `ceo-donald/videocut/lib/hook-concat.js` | `capabilities/hook/concat.js` | Modularize exports |
| `ceo-donald/videocut/lib/merge-srt-for-douyin.js` | `lib/srt.js` (merged) | Combine with generate_srt.js |

### Write new

| File | Purpose |
|------|---------|
| `cli.js` | Unified CLI entry point |
| `capabilities/*/index.js` (×7) | Orchestration logic (extracted from run.sh inline node -e) |
| `lib/srt.js` | SRT parse/generate/merge (consolidate existing code) |
| `lib/ffmpeg.js` | child_process FFmpeg wrapper |
| `lib/claude.js` | AI call + retry logic |
| `capabilities/speed/*` | New capability |
| `capabilities/clip/*` | From SplitPage.tsx + youtube-clipper reference |
| `pipeline.js` | Capability chaining |
| `7 × SKILL.md` | Agent documentation |

## Constraints

- **Spoken-word video only** (for now). Single speaker, no background music. Future: extend to other formats.
- **Local execution only.** FFmpeg, Whisper, Chrome all run locally. No cloud dependencies except Claude API for AI analysis.
- **No web dashboard changes** in this scope. web/ directory stays as-is.
