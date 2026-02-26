# Content Pipeline Master Script Spec

## Goal
One command: `./pipeline.sh <video.mp4>` → all content generated and ready for review.

## Location
~/videocut/pipeline.sh

## Dependencies Available
- ~/videocut/run.sh (video editing)
- ~/videocut/content-repurpose.sh (content derivation)
- ~/baoyu-skills/skills/ (visual generation + publishing)
- bun, ffmpeg, whisper, claude CLI

## Pipeline Phases

### Phase 1: Video Edit (bash)
```bash
./run.sh <video.mp4> small --no-server
```
Output: output/<date>_<name>/ with 1_转录/, 2_分析/, 3_审核/

### Phase 2: Content Derivation (bash)
```bash
./content-repurpose.sh output/<date>_<name>/ <video.mp4>
```
Output: 4_内容降维/ with article_cn.md, article_en.md, podcast.mp3, quotes.json, video_meta.json, thumbnail.png, cards/

### Phase 3: Platform-Specific Content (Claude CLI)
Use `claude -p "prompt" --output-format text` to generate:

From article_cn.md:
- 即刻短版 (< 1000字, 去标题去分隔线, 口语化) → jike_post.md
- 小红书文案 (< 500字, 带emoji, 带话题标签) → xhs_caption.md
- 公众号版 (保留原文, 加引导关注) → wechat_article.md

From article_en.md:
- X thread (拆成5-8条, 每条<280字) → x_thread.json
- X 单条 hot take (< 280字) → x_post.md

Output: 5_平台内容/

### Phase 4: Visual Enhancement (bun + image-gen)
Use baoyu image-gen to generate:
- 封面图 (16:9 for YouTube/B站) → cover_16x9.png
- 封面图 (1:1 for X) → cover_1x1.png

For XHS images: use Claude CLI to read article_cn.md, generate structured content JSON, then create HTML→screenshot (same approach as generate-cards.sh but with baoyu xhs style presets)

Output: 6_视觉/

### Phase 5: Manifest
Generate manifest.json listing all outputs with platform assignments:
```json
{
  "video": { "master": "path", "thumbnail": "path" },
  "platforms": {
    "x_post": { "text": "path", "image": "path", "status": "pending" },
    "x_thread": { "text": "path", "status": "pending" },
    "x_article": { "text": "path", "cover": "path", "status": "pending" },
    "wechat": { "html": "path", "status": "pending" },
    "jike": { "text": "path", "status": "pending" },
    "xhs": { "text": "path", "images": ["path"], "status": "pending" },
    "youtube": { "video": "path", "meta": "path", "status": "pending" },
    "bilibili": { "video": "path", "meta": "path", "status": "pending" },
    "podcast": { "audio": "path", "meta": "path", "status": "pending" }
  }
}
```

### Phase 6: Review Summary
Print a summary of all generated content with file sizes.
The review/publish step will be handled separately (by OpenClaw agent sending to Telegram).

## Key Design Decisions
1. NO interactive prompts - fully automated
2. Each phase checks previous phase outputs exist before proceeding
3. Errors in one platform don't block others
4. All Claude CLI calls use `claude -p "prompt" --output-format text`
5. Progress printed to stdout with timestamps
6. Total runtime target: < 5 minutes for a 3-min video
