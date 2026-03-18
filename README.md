<div align="center">

# videocut

**录一次口播，自动出 7 种内容 — 视频粗剪 + 多平台内容降维 Pipeline**

[![Shell](https://img.shields.io/badge/Shell-Bash-green)](https://www.gnu.org/software/bash/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org/)
[![Claude CLI](https://img.shields.io/badge/AI-Claude_CLI-blueviolet)](https://docs.anthropic.com/en/docs/claude-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 痛点

录一条 2 分钟的口播视频，后续工作至少需要 30 分钟：

- 手动去停顿、去口误、去"嗯啊那个"
- 手写公众号文章、即刻短帖、小红书文案、英文 Medium 文章
- 导出播客音频并做响度规范化
- 设计视频封面和金句卡片
- 拆 X Thread、写 hot take、填视频标题标签

一条视频 × 8 个平台 = 反复搬运、反复排版、反复人肉。

## 解决方案

`videocut` 把口播视频变成一条 Pipeline：**一个命令，6 个阶段，自动输出全部内容物料。**

```
./pipeline.sh video.mp4
```

输入一个视频文件，输出：剪辑成片 + 中英文章 + 播客音频 + 金句卡片 + 封面图 + 8 平台发布文案 + manifest.json。

## 架构

```
                         pipeline.sh (master orchestrator)
                                    |
         ┌──────────────────────────┼──────────────────────────┐
         v                          v                          v
   ┌──────────┐            ┌───────────────┐          ┌──────────────┐
   │  run.sh  │            │ content-      │          │ generate-    │
   │ 视频粗剪  │            │ repurpose.sh  │          │ cards.sh     │
   └──────────┘            │ 内容降维       │          │ 金句卡片      │
         |                 └───────────────┘          └──────────────┘
         v                          |                        |
  ┌─────────────┐                   v                        v
  │ Whisper     │  ┌──────────────────────────┐   ┌──────────────────┐
  │ 本地转录     │  │ Claude CLI               │   │ Chrome Headless  │
  │      +      │  │ 文章改写 / 元数据 / 金句    │   │ HTML → PNG 截图   │
  │ AI 口误分析  │  │ 平台内容生成               │   └──────────────────┘
  │      +      │  └──────────────────────────┘
  │ FFmpeg 剪辑  │
  └─────────────┘

  Phase 1        Phase 2-3                       Phase 4
  视频剪辑        内容降维 + 平台内容               卡片 + 封面
```

## 快速开始

### 1. 安装依赖

```bash
brew install ffmpeg node
pip install openai-whisper
```

确保已安装 [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) 并完成认证。
封面和卡片截图依赖 Google Chrome（macOS 默认路径）。

### 2. 克隆仓库

```bash
git clone https://github.com/zinan92/videocut.git
cd videocut
```

### 3. 一键运行完整 Pipeline

```bash
./pipeline.sh video.mp4
```

输出目录 `output/YYYY-MM-DD_video/`，包含全部内容物料和 `manifest.json`。

### 4. 或分步执行

```bash
# 仅视频粗剪（含审核网页）
./run.sh video.mp4

# 仅视频粗剪（跳过审核，直接剪）
./run.sh video.mp4 small --no-server

# 仅内容降维（在已有输出目录上运行）
./content-repurpose.sh ./output/2026-02-26_video/

# 仅金句卡片
./generate-cards.sh ./output/2026-02-26_video/4_quotes.json

# Pipeline 跳过剪辑阶段（已有输出目录时续跑）
./pipeline.sh video.mp4 --skip-edit --output-dir ./output/2026-02-26_video/
```

## 功能一览

| 阶段 | 脚本 | 输入 | 输出 | 说明 |
|------|------|------|------|------|
| Phase 1 | `run.sh` | 视频文件 | 剪辑成片 `3_output_cut.mp4` | Whisper 转录 → 静音标记 → AI 口误分析 → 审核网页 → FFmpeg 剪辑 |
| Phase 2 | `content-repurpose.sh` | 输出目录 | 中英文章、播客、金句、封面、元数据 | Claude CLI 改写 + FFmpeg 音频规范化 + Chrome 截图 |
| Phase 3 | `pipeline.sh` 内置 | 中英文章 | 即刻/小红书/公众号/X Thread/X Post | Claude CLI 按平台风格改写 |
| Phase 4 | `generate-cards.sh` | `4_quotes.json` | 1080x1080 金句卡片 PNG | HTML 模板 + Chrome Headless 截图，@xparkzz 水印 |
| Phase 5 | `pipeline.sh` 内置 | 全部产物 | `manifest.json` | 结构化清单，含各平台发布状态 |
| Phase 6 | `pipeline.sh` 内置 | — | 终端 Summary | 打印所有产物及文件大小 |
| Phase 7 | `publish.sh` | 全部产物 | 4 平台发布 | 半自动引导发布到抖音/小红书/公众号/X |

### 发布

Pipeline 生成内容后，使用 `publish.sh` 半自动发布到各平台：

```bash
# 独立使用
./publish.sh output/2026-03-18_video/

# 或集成到 pipeline（生产 + 发布一条龙）
./pipeline.sh video.mp4 --publish

# 只发布特定平台
./publish.sh output/2026-03-18_video/ --platform x
```

支持平台：

| 平台 | 模式 | 说明 |
|------|------|------|
| 抖音 | 半自动 | 复制标题 → 打开创作者中心 → 手动上传视频 |
| 小红书 | 半自动 | 复制文案 → 打开创作者中心 → 手动上传卡片图 |
| 公众号 | 半自动 | 复制文章 → 打开公众号后台 → 手动排版发布 |
| X/Twitter | 自动/半自动 | 安装 [bird CLI](https://github.com/nicholasgasior/bird) 后自动发 thread |

**可选依赖：**
- [bird CLI](https://github.com/nicholasgasior/bird) — 解锁 X 自动发布（`brew install bird`）

## 技术栈

| 工具 | 用途 |
|------|------|
| FFmpeg | 音频提取、视频剪辑、播客音频规范化 (-16 LUFS) |
| openai-whisper | 本地语音转录（支持 tiny/base/small/medium/large 模型） |
| Node.js | 字幕处理、审核网页生成、静音分析、截图脚本 |
| Claude CLI | AI 口误分析、文章改写、金句提取、元数据生成、平台内容改写 |
| Google Chrome (Headless) | 封面图和金句卡片的 HTML → PNG 截图 |
| Bash | Pipeline 编排、断点续跑、参数解析 |

## 项目结构

```
videocut/
├── pipeline.sh                 # 一键 Pipeline（6 阶段编排）
├── run.sh                      # 视频粗剪入口
├── content-repurpose.sh        # 内容降维入口
├── generate-cards.sh           # 金句卡片生成
├── PIPELINE_SPEC.md            # Pipeline 设计文档
├── 剪口播/
│   ├── SKILL.md                # 剪辑 Skill 说明
│   ├── 用户习惯/               # AI 口误分析规则（偏好文件）
│   └── scripts/
│       ├── whisper_transcribe.sh    # Whisper 本地转录
│       ├── generate_subtitles.js    # 字级别字幕生成
│       ├── generate_review.js       # 审核网页生成
│       ├── review_server.js         # 审核网页 HTTP 服务器
│       └── cut_video.sh            # FFmpeg 剪辑执行
├── 字幕/
│   ├── SKILL.md                # 字幕 Skill 说明
│   ├── 词典.txt                # 自定义词典
│   └── scripts/
│       └── subtitle_server.js  # 字幕预览服务器
├── 自进化/                     # 偏好自更新规则
│   └── SKILL.md
├── 安装/                       # 安装指引
│   └── SKILL.md
└── output/                     # 输出目录（gitignore）
```

## 输出目录结构

```
output/YYYY-MM-DD_视频名/
├── 1_audio.mp3                 # 提取的音频
├── 1_volcengine_result.json    # Whisper 转录原始结果
├── 1_subtitles_words.json      # 字级别字幕 JSON
├── 2_readable.txt              # 可读格式（idx|内容|时间）
├── 2_sentences.txt             # 句子列表
├── 2_auto_selected.json        # 删除标记（静音 + AI 口误）
├── 3_review.html               # 审核网页
├── 3_delete_segments.json      # 删除时间段
├── 3_output_cut.mp4            # 剪辑成片
├── 4_transcript.txt            # 纯文字转录稿
├── 4_article_cn.md             # 中文文章
├── 4_article_en.md             # 英文文章
├── 4_podcast.mp3               # 播客音频（-16 LUFS）
├── 4_quotes.json               # 金句 JSON
├── 4_video_meta.json           # 视频元数据（标题/描述/标签，中英双语）
├── 4_thumbnail.png             # 视频封面（1280x720）
├── 4_card_1.png ... N.png      # 金句卡片（1080x1080）
├── 5_jike_post.md              # 即刻短版
├── 5_xhs_caption.md            # 小红书文案
├── 5_wechat_article.md         # 公众号文章
├── 5_x_thread.json             # X Thread（5-8 条）
├── 5_x_post.md                 # X 单条 hot take
└── manifest.json               # 全部产物清单
```

## For AI Agents

### Metadata

```yaml
tool_type: cli
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
exit_codes:
  0: success
  1: missing input / dependency error / phase failure
```

### Subcommands

```yaml
commands:
  - name: pipeline
    run: ./pipeline.sh <video>
    description: Full 6-phase pipeline — edit, derive, platform content, cards, manifest, summary
    args:
      - --skip-edit: Skip Phase 1 video editing
      - --output-dir <dir>: Specify existing output directory
      - --publish: Run Phase 7 publishing after content generation

  - name: edit
    run: ./run.sh <video> [model] [--no-server]
    description: Video rough cut — Whisper transcription + AI stutter detection + review page + FFmpeg cut
    args:
      - model: whisper model size (tiny/base/small/medium/large, default small)
      - --no-server: Skip review server, cut directly

  - name: repurpose
    run: ./content-repurpose.sh <output_dir> [video_path]
    description: Content derivation — articles, podcast audio, quotes, thumbnail, metadata

  - name: cards
    run: ./generate-cards.sh <4_quotes.json>
    description: Generate 1080x1080 quote card PNGs from quotes JSON

  - name: publish
    run: ./publish.sh <output_dir> [--platform <name>]
    description: Semi-auto publishing to 4 platforms (Douyin, Xiaohongshu, WeChat OA, X/Twitter)
    args:
      - --platform <name>: Only publish to specified platform (douyin|xhs|wechat|x)
```

### Agent Workflow Example

```python
import subprocess
import json
from pathlib import Path

# Step 1: Run full pipeline
result = subprocess.run(
    ["./pipeline.sh", "/path/to/video.mp4"],
    cwd="/path/to/videocut",
    capture_output=True, text=True, timeout=600
)

if result.returncode != 0:
    raise RuntimeError(f"Pipeline failed: {result.stderr}")

# Step 2: Read manifest for structured output paths
output_dir = sorted(Path("/path/to/videocut/output").iterdir())[-1]
manifest = json.loads((output_dir / "manifest.json").read_text())

# Step 3: Access specific outputs
article_cn = (output_dir / "4_article_cn.md").read_text()
x_thread = json.loads((output_dir / "5_x_thread.json").read_text())
platforms = manifest["platforms"]  # each has path + status
```

## 相关项目

- [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills) — 上游 fork 源

## License

MIT
