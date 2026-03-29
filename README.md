# videocut

将口播视频一键转化为 8 平台全套发布物料，从粗剪到半自动发布全流程覆盖。

```
in  视频文件 (mp4/mov)
out output/<date>_<name>/ 目录，含：
    带字幕剪辑成片 + 中英文章 + 播客音频 + 金句卡片 + 封面图 + 8 平台文案 + manifest.json

fail 视频文件不存在           → exit 1, stderr 提示路径
fail ffmpeg/whisper/node 缺失 → exit 1, 依赖检查失败
fail Claude CLI 未认证       → Phase 2+ 挂起，需先 claude auth
fail Chrome 未安装           → Phase 4 卡片/封面生成跳过
fail 某 Phase 中途失败       → exit 1, 重跑自动跳过已完成阶段（断点续跑）
```

## 架构

```
                      pipeline.sh (master orchestrator)
                                 |
         ┌───────────────────────┼───────────────────────┐
         v                       v                       v
   ┌──────────┐          ┌──────────────┐        ┌──────────────┐
   │  run.sh  │          │  content-    │        │  generate-   │
   │ 视频粗剪  │          │  repurpose   │        │  cards.sh    │
   │ + 字幕    │          │  内容降维     │        │  金句卡片     │
   └──────────┘          └──────────────┘        └──────────────┘
        |                       |                       |
   Whisper 转录           Claude CLI x9           Chrome Headless
   AI 口误分析            (并行，带重试)            HTML → PNG
   FFmpeg 剪辑 + 字幕
        |                       |                       |
        └───────────────────────┼───────────────────────┘
                                v
                    ┌───────────────────┐
                    │   publish.sh      │
                    │  4 平台半自动发布   │
                    └───────────────────┘
                                |
                    ┌───────────────────┐
                    │  Web Dashboard    │
                    │  React + Express  │
                    │  实时进度 + 发布   │
                    └───────────────────┘
```

## 快速开始

```bash
brew install ffmpeg node
pip install openai-whisper
# 确保已安装 Claude CLI (https://docs.anthropic.com/en/docs/claude-cli) 并完成认证
# 封面和卡片依赖 Google Chrome

git clone https://github.com/zinan92/videocut.git
cd videocut

# CLI: 一键生成全部内容
./pipeline.sh video.mp4

# CLI: 生成 + 发布
./pipeline.sh video.mp4 --publish

# Web Dashboard
cd web && npm install && npm run dev
# 打开 http://localhost:5173
```

分步执行：

```bash
./run.sh video.mp4 small --no-server            # 仅粗剪，跳过审核直接剪
./content-repurpose.sh ./output/2026-02-26_video/  # 仅内容降维
./generate-cards.sh ./output/2026-02-26_video/4_quotes.json  # 仅金句卡片
./publish.sh ./output/2026-02-26_video/          # 仅发布
./publish.sh ./output/2026-02-26_video/ --platform x  # 只发 X

# 断点续跑
./pipeline.sh video.mp4 --skip-edit --output-dir ./output/2026-02-26_video/
```

## 功能一览

| 阶段 | 脚本 | 说明 |
|------|------|------|
| Phase 1 | `run.sh` | Whisper 转录 → AI 口误分析 → FFmpeg 剪辑 → 字幕烧录 |
| Phase 2 | `content-repurpose.sh` | 中英文章 + 播客音频 (-16 LUFS) + 金句提取 + 封面图 + 元数据 |
| Phase 3 | `pipeline.sh` 内置 | 5 平台文案并行生成（即刻/小红书/公众号/X Thread/X Post） |
| Phase 4 | `generate-cards.sh` | 1080x1080 金句卡片 PNG（Chrome Headless 截图） |
| Phase 5 | `pipeline.sh` 内置 | `manifest.json` 结构化清单 |
| Phase 6 | `pipeline.sh` 内置 | 终端 Summary |
| Phase 7 | `publish.sh` | 半自动发布到抖音/小红书/公众号/X |
| Dashboard | `web/` | React 前端：上传 → 实时进度 → 内容预览 → 一键发布 |
| 长视频拆条 | Dashboard 内置 | AI 章节分析 → 时间轴选择 → FFmpeg 切割 + 字幕 |

### 发布平台

| 平台 | 模式 | 说明 |
|------|------|------|
| 抖音 | 半自动 | 复制标题 → 打开创作者中心 → 手动上传 |
| 小红书 | 半自动 | 复制文案 → 打开创作者中心 → 手动上传卡片图 |
| 公众号 | 半自动 | 复制文章 → 打开后台 → 手动排版发布 |
| X/Twitter | 自动/半自动 | 安装 [bird CLI](https://github.com/nicholasgasior/bird) 后自动发 thread |

### Web Dashboard

```bash
cd web && npm install
npm run dev           # 开发模式 http://localhost:5173
npm run build && npm start  # 生产模式 http://localhost:3789
```

- 拖拽上传视频，实时查看 7 阶段进度（SSE）
- 完成后预览所有生成内容（文章、文案、卡片、推文）
- 每个平台一键复制 + 打开发布页 + 标记已发布
- 长视频拆条：AI 分析章节 → 时间轴可视化选择 → FFmpeg 逐段切割 + 字幕烧录

### 智能特性

- **Retry 重试**：所有 Claude 调用自带 3 次指数退避重试（1s→3s→9s），stdin 缓存确保 prompt 不丢失
- **并行生成**：Phase 3 的 5 个平台内容并行执行
- **断点续跑**：每阶段检查已有产物，失败后重跑自动跳过完成的阶段
- **Feedback Loop**：审核 UI 捕获 AI 建议 vs 用户修正 diff，聚合后注入未来 AI prompt
- **字幕烧录**：Whisper 词级别 JSON → SRT → FFmpeg 烧录（PingFang SC 白字黑边）

## API 参考（Web Dashboard）

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/upload` | 上传视频文件（multipart） |
| `GET` | `/api/pipeline/start?video=path` | SSE 实时 Pipeline 进度 |
| `GET` | `/api/outputs` | 列出所有输出目录 |
| `GET` | `/api/outputs/:dir` | 获取输出详情及内容 |
| `GET` | `/api/outputs/:dir/file/:name` | 下载产物文件 |
| `POST` | `/api/outputs/:dir/publish/:platform` | 更新发布状态 |
| `GET` | `/api/split/transcribe?video=path` | SSE 转录进度（拆条用） |
| `POST` | `/api/split/analyze` | AI 章节分析 |
| `POST` | `/api/split/execute` | 执行视频拆条 |

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
│       ├── generate_srt.js
│       ├── generate_review.js
│       ├── review_server.js
│       ├── cut_video.sh
│       └── feedback_aggregator.js
├── 字幕/                       # 字幕 Skill
├── 自进化/                     # 偏好自更新规则
├── web/                        # Web Dashboard
│   ├── server.js               # Express 后端（API + SSE）
│   └── src/
│       └── pages/              # PipelinePage, PublishPage, SplitPage
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
├── 4_thumbnail.png             # 封面图（1280x720）
├── 4_card_*.png                # 金句卡片（1080x1080）
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

### Capability Contract

```yaml
name: videocut
type: cli-pipeline + web-dashboard
version: 2.0.0
description: >
  将口播视频一键转化为 8 平台全套发布物料。
  Whisper 本地转录 → AI 口误检测 → FFmpeg 剪辑 + 字幕 → Claude CLI 内容降维 →
  多平台文案并行生成 → 金句卡片 → 半自动发布。附带 React Web Dashboard。

interface:
  input:
    - type: file
      format: mp4, mov
      description: 口播视频文件
  output:
    - type: directory
      path: output/<date>_<name>/
      manifest: manifest.json
      description: 全部产物目录，manifest.json 含各文件路径及平台发布状态

  commands:
    pipeline:
      run: ./pipeline.sh <video> [--skip-edit] [--output-dir <dir>] [--publish]
      description: 完整 7 阶段 Pipeline
    edit:
      run: ./run.sh <video> [model] [--no-server] [--no-subtitle]
      description: 视频粗剪 + 字幕烧录
    repurpose:
      run: ./content-repurpose.sh <output_dir> [video_path]
      description: 内容降维
    cards:
      run: ./generate-cards.sh <4_quotes.json>
      description: 金句卡片生成
    publish:
      run: ./publish.sh <output_dir> [--platform douyin|xhs|wechat|x]
      description: 半自动发布

  failure_modes:
    - condition: 视频文件不存在
      exit_code: 1
      behavior: stderr 提示路径
    - condition: 依赖缺失 (ffmpeg/whisper/node)
      exit_code: 1
      behavior: 依赖检查失败
    - condition: Claude CLI 未认证
      exit_code: 1
      behavior: Phase 2+ 挂起
    - condition: Phase 中途失败
      exit_code: 1
      behavior: 断点续跑自动跳过已完成阶段

  dependencies:
    runtime: [ffmpeg, openai-whisper, "node 18+", claude-cli, google-chrome]

  web_dashboard:
    start: cd web && npm install && npm start
    port: 3789
    endpoints:
      - POST /api/upload
      - GET /api/pipeline/start?video=path (SSE)
      - GET /api/outputs
      - GET /api/outputs/:dir
      - POST /api/outputs/:dir/publish/:platform
      - POST /api/split/analyze
      - POST /api/split/execute
```

### Agent 调用示例

```python
import subprocess
import json
from pathlib import Path

result = subprocess.run(
    ["./pipeline.sh", "/path/to/video.mp4", "--publish"],
    cwd="/path/to/videocut",
    capture_output=True, text=True, timeout=600
)
if result.returncode != 0:
    raise RuntimeError(f"Pipeline failed: {result.stderr}")

output_dir = sorted(Path("/path/to/videocut/output").iterdir())[-1]
manifest = json.loads((output_dir / "manifest.json").read_text())

article_cn = (output_dir / "4_article_cn.md").read_text()
x_thread = json.loads((output_dir / "5_x_thread.json").read_text())
platforms = manifest["platforms"]  # status: pending/published/skipped
```

## 相关项目

- [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills) — 上游 fork 源

## License

MIT
