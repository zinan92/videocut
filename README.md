<div align="center">

# videocut

**录一次视频，自动出全平台内容 — 从粗剪到发布的一站式内容工厂**

[![Shell](https://img.shields.io/badge/Shell-Bash-green)](https://www.gnu.org/software/bash/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)
[![Claude CLI](https://img.shields.io/badge/AI-Claude_CLI-blueviolet)](https://docs.anthropic.com/en/docs/claude-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 示例产出

<div align="center">

**封面图** — 自动生成 (1280×720)

<img src="examples/4_thumbnail.png" width="600" />

**金句卡片** — AI 提取 + 设计 (1080×1080)

<img src="examples/4_card_1.png" width="400" />

</div>

<details>
<summary>📱 即刻文案示例</summary>

> AI替代这件事，最核心的一句话：不是AI够不够强，而是它还没渗透到普通人的日常。但这个窗口期，不会太久了。
>
> 我用Cursor三四百小时，Claude Code快一年，每月200刀额度。说实话，现在AI能自主跑几个小时不停，一个AI管一群AI干活。我一个不会写代码的人，一天就能开发出一个软件。

</details>

<details>
<summary>🐦 X Post 示例</summary>

> Most people think AI isn't useful yet because they're comparing it to magic. Meanwhile, someone who can't code just built a full app in a day using Claude. The gap isn't capability—it's imagination.

</details>

---

## 痛点

录一条口播视频，后续搬运工作要 30-60 分钟：去口误、写文章、做封面、拆推文、发 8 个平台。一条视频 × 8 个平台 = 反复人肉。

## 解决方案

`videocut` 把口播变成一条 Pipeline — **一个命令，7 个阶段，从粗剪到发布全搞定。**

```bash
./pipeline.sh video.mp4 --publish
```

输入一个视频文件，输出：带字幕剪辑成片 + 中英文章 + 播客音频 + 金句卡片 + 封面图 + 8 平台文案 + 4 平台引导发布。

还有 **Web Dashboard**：拖拽上传、实时进度、内容预览、一键复制发布。

## 架构

```
                      pipeline.sh (master orchestrator)
                                 │
         ┌───────────────────────┼───────────────────────┐
         v                       v                       v
   ┌──────────┐          ┌──────────────┐        ┌──────────────┐
   │  run.sh  │          │  content-    │        │  generate-   │
   │ 视频粗剪  │          │  repurpose   │        │  cards.sh    │
   │ + 字幕    │          │  内容降维     │        │  金句卡片     │
   └──────────┘          └──────────────┘        └──────────────┘
        │                       │                       │
   Whisper 转录           Claude CLI ×9           Chrome Headless
   AI 口误分析            (并行，带重试)            HTML → PNG
   FFmpeg 剪辑 + 字幕
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                v
                    ┌───────────────────┐
                    │   publish.sh      │
                    │  4 平台半自动发布   │
                    │  (抖音/小红书/     │
                    │   公众号/X)        │
                    └───────────────────┘
                                │
                    ┌───────────────────┐
                    │  Web Dashboard    │
                    │  React + Express  │
                    │  实时进度 + 发布   │
                    └───────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
brew install ffmpeg node
pip install openai-whisper
```

确保已安装 [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) 并完成认证。封面和卡片依赖 Google Chrome。

### 2. 克隆仓库

```bash
git clone https://github.com/zinan92/videocut.git
cd videocut
```

### 3. 运行

```bash
# CLI：一键生成全部内容
./pipeline.sh video.mp4

# CLI：生成 + 发布
./pipeline.sh video.mp4 --publish

# Web Dashboard
cd web && npm install && npm run dev
# 打开 http://localhost:5173
```

## 功能一览

| 阶段 | 脚本 | 说明 | 状态 |
|------|------|------|------|
| Phase 1 | `run.sh` | Whisper 转录 → AI 口误分析 → FFmpeg 剪辑 → **字幕烧录** | ✅ |
| Phase 2 | `content-repurpose.sh` | 中英文章 + 播客音频 (-16 LUFS) + 金句提取 + 封面图 + 元数据 | ✅ |
| Phase 3 | `pipeline.sh` 内置 | 5 平台文案**并行**生成（即刻/小红书/公众号/X Thread/X Post） | ✅ |
| Phase 4 | `generate-cards.sh` | 1080×1080 金句卡片 PNG（Chrome Headless 截图） | ✅ |
| Phase 5 | `pipeline.sh` 内置 | `manifest.json` 结构化清单 | ✅ |
| Phase 6 | `pipeline.sh` 内置 | 终端 Summary | ✅ |
| Phase 7 | `publish.sh` | 半自动发布到抖音/小红书/公众号/X | ✅ |
| Dashboard | `web/` | React 前端：上传 → 实时进度 → 内容预览 → 一键发布 | ✅ |
| 长视频拆条 | Dashboard 内置 | AI 章节分析 → 时间轴选择 → FFmpeg 切割 + 字幕 | ✅ |

### 发布

```bash
# 独立使用
./publish.sh output/2026-03-18_video/

# 集成到 pipeline
./pipeline.sh video.mp4 --publish

# 只发特定平台
./publish.sh output/2026-03-18_video/ --platform x
```

| 平台 | 模式 | 说明 |
|------|------|------|
| 抖音 | 半自动 | 复制标题 → 打开创作者中心 → 手动上传 |
| 小红书 | 半自动 | 复制文案 → 打开创作者中心 → 手动上传卡片图 |
| 公众号 | 半自动 | 复制文章 → 打开后台 → 手动排版发布 |
| X/Twitter | 自动/半自动 | 安装 [bird CLI](https://github.com/nicholasgasior/bird) 后自动发 thread |

### Web Dashboard

```bash
cd web
npm install
npm run dev      # 开发模式 http://localhost:5173
npm run build && npm start  # 生产模式 http://localhost:3789
```

功能：
- 拖拽上传视频，实时查看 6 阶段进度（SSE）
- 完成后预览所有生成内容（文章、文案、卡片、推文）
- 每个平台一键复制 + 打开发布页 + 标记已发布
- **长视频拆条**：AI 分析章节 → 时间轴可视化选择 → FFmpeg 逐段切割 + 字幕烧录

### 智能特性

- **Retry 重试**：所有 Claude 调用自带 3 次指数退避重试（1s→3s→9s），stdin 缓存确保 prompt 不丢失
- **并行生成**：Phase 3 的 5 个平台内容并行执行（~2.5min → ~30s）
- **断点续跑**：每阶段检查已有产物，失败后重跑自动跳过完成的阶段
- **Feedback Loop**：审核 UI 捕获 AI 建议 vs 用户修正 diff，聚合后注入未来 AI prompt，越用越准
- **字幕烧录**：Whisper 词级别 JSON → SRT → FFmpeg 烧录（PingFang SC 白字黑边）

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 编排 | Bash | Pipeline 编排、断点续跑、参数解析 |
| 转录 | openai-whisper | 本地语音转录（tiny/base/small/medium/large） |
| AI | Claude CLI | 口误分析、文章改写、金句提取、元数据生成、平台文案、章节分析 |
| 音视频 | FFmpeg | 音频提取、视频剪辑、播客规范化 (-16 LUFS)、字幕烧录 |
| 截图 | Chrome Headless | 封面图 + 金句卡片 HTML → PNG |
| 前端 | React 18 + Vite 5 + Tailwind 3 | Web Dashboard |
| 后端 | Express 4 + Multer | 文件上传、SSE 实时推送、内容 API |
| 字幕 | Node.js | SRT 生成、字级别字幕处理 |

## 项目结构

```
videocut/
├── pipeline.sh                 # 一键 Pipeline（7 阶段编排）
├── run.sh                      # 视频粗剪 + 字幕烧录
├── content-repurpose.sh        # 内容降维
├── generate-cards.sh           # 金句卡片生成
├── publish.sh                  # 4 平台半自动发布
├── 剪口播/
│   ├── 用户习惯/               # AI 口误分析规则
│   └── scripts/
│       ├── whisper_transcribe.sh
│       ├── generate_subtitles.js
│       ├── generate_srt.js     # SRT 字幕生成
│       ├── generate_review.js  # 审核网页
│       ├── review_server.js    # 审核 HTTP 服务器
│       ├── cut_video.sh        # FFmpeg 剪辑
│       └── feedback_aggregator.js  # 用户修正聚合
├── 字幕/                       # 字幕 Skill
├── 自进化/                     # 偏好自更新规则
├── web/                        # Web Dashboard
│   ├── server.js               # Express 后端（API + SSE）
│   ├── src/
│   │   ├── pages/              # PipelinePage, PublishPage, SplitPage
│   │   └── components/         # FileUpload, PhaseProgress, PlatformCard,
│   │                           # ChapterTimeline, ChapterCard
│   └── package.json
├── examples/                   # 示例产出（封面图、卡片、文案）
└── output/                     # 输出目录（gitignore）
```

## 输出目录结构

```
output/YYYY-MM-DD_视频名/
├── 1_audio.mp3                 # 提取的音频
├── 1_volcengine_result.json    # Whisper 转录结果
├── 1_subtitles_words.json      # 字级别字幕 JSON
├── 1_subtitles.srt             # SRT 字幕文件
├── 2_readable.txt              # 可读格式
├── 2_auto_selected.json        # 删除标记（静音 + AI 口误）
├── 3_output_cut.mp4            # 剪辑成片（无字幕）
├── 3_output_subtitled.mp4      # 剪辑成片（带字幕）
├── 3_feedback.json             # AI vs 用户修正 diff
├── 4_article_cn.md             # 中文文章
├── 4_article_en.md             # 英文文章
├── 4_podcast.mp3               # 播客音频（-16 LUFS）
├── 4_quotes.json               # 金句 JSON
├── 4_video_meta.json           # 视频元数据（中英双语）
├── 4_thumbnail.png             # 封面图（1280×720）
├── 4_card_*.png                # 金句卡片（1080×1080）
├── 5_jike_post.md              # 即刻文案
├── 5_xhs_caption.md            # 小红书文案
├── 5_wechat_article.md         # 公众号文章
├── 5_x_thread.json             # X Thread
├── 5_x_post.md                 # X 单条 hot take
├── manifest.json               # 全部产物清单 + 发布状态
└── splits/                     # 长视频拆条产物（可选）
    └── split_N_标题.mp4
```

## For AI Agents

### 结构化元数据

```yaml
name: videocut
description: One-command content factory — turns a single video into subtitled clips, articles, podcast audio, quote cards, and platform-specific posts for 8+ platforms
version: 2.0.0
cli_command: ./pipeline.sh
cli_args: "<video_file> [--skip-edit] [--output-dir <dir>] [--publish]"
language: bash
dependencies:
  - ffmpeg
  - openai-whisper
  - node (18+)
  - claude-cli
  - google-chrome
input: video file (mp4/mov)
output: output/<date>_<name>/ directory with manifest.json
capabilities:
  - transcribe video with local Whisper
  - detect and remove stutters and filler words via AI
  - burn subtitles into video (SRT + FFmpeg)
  - generate Chinese and English articles from transcript
  - generate platform-specific posts (Jike, Xiaohongshu, WeChat, X)
  - extract podcast audio with loudness normalization
  - generate thumbnail and quote card images
  - semi-auto publish to 4 platforms
  - split long videos into chapters via AI analysis
exit_codes:
  0: success
  1: missing input / dependency error / phase failure
commands:
  - name: pipeline
    run: ./pipeline.sh <video>
    description: Full 7-phase pipeline
    args:
      - --skip-edit: Skip Phase 1
      - --output-dir <dir>: Use existing output directory
      - --publish: Run Phase 7 publishing
  - name: edit
    run: ./run.sh <video> [model] [--no-server]
    description: Video rough cut + subtitle burn
  - name: repurpose
    run: ./content-repurpose.sh <output_dir> [video_path]
    description: Content derivation
  - name: cards
    run: ./generate-cards.sh <4_quotes.json>
    description: Quote card PNGs
  - name: publish
    run: ./publish.sh <output_dir> [--platform <name>]
    description: Semi-auto publishing (douyin|xhs|wechat|x)
web_dashboard:
  start: cd web && npm install && npm start
  port: 3789
  endpoints:
    - POST /api/upload: Upload video file
    - GET /api/pipeline/start?video=path: SSE pipeline progress
    - GET /api/outputs: List all output directories
    - GET /api/outputs/:dir: Get output detail with content
    - GET /api/outputs/:dir/file/:name: Serve output files
    - POST /api/outputs/:dir/publish/:platform: Update publish status
    - GET /api/split/transcribe?video=path: SSE transcription for splitting
    - POST /api/split/analyze: AI chapter analysis
    - POST /api/split/execute: Execute video splitting
```

### Agent 调用示例

```python
import subprocess
import json
from pathlib import Path

# Run full pipeline with publishing
result = subprocess.run(
    ["./pipeline.sh", "/path/to/video.mp4", "--publish"],
    cwd="/path/to/videocut",
    capture_output=True, text=True, timeout=600
)

# Read structured output
output_dir = sorted(Path("/path/to/videocut/output").iterdir())[-1]
manifest = json.loads((output_dir / "manifest.json").read_text())

# Access content
article_cn = (output_dir / "4_article_cn.md").read_text()
x_thread = json.loads((output_dir / "5_x_thread.json").read_text())
platforms = manifest["platforms"]  # status: pending/published/skipped
```

## 相关项目

- [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills) — 上游 fork 源

## License

MIT
