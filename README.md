<div align="center">

# Videocut

**口播视频编辑能力集。7 个独立 CLI 工具，各自可用，也可串联成流水线。**

[![Node.js](https://img.shields.io/badge/node-18+-339933.svg)](https://nodejs.org)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Audio%2FVideo-007808.svg?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![Claude CLI](https://img.shields.io/badge/Claude_CLI-AI_Engine-CC785C.svg?logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-cli)
[![Tests](https://img.shields.io/badge/tests-91_passing-brightgreen.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

```
in  视频文件 (mp4/mov)
out 剪辑视频 + 字幕 + 金句片段 + 封面卡片 + 章节切片

fail 视频文件不存在           → exit 1, 提示路径
fail ffmpeg/whisper/node 缺失 → exit 1, 依赖检查提示安装
fail Claude CLI 未认证       → AI 分析步骤失败，可用静音检测 fallback
fail Chrome 未安装           → cover 能力跳过
```

## 示例输出

```bash
$ node cli.js videocut autocut ~/录制.mp4 -o /tmp/demo/ --no-review

═══ AutoCut: Transcribing ═══
  Extracting audio...
  Transcribing (model: small)...
  Done: 42 subtitle entries
═══ AutoCut: Silence detection ═══
  12 silence segments (≥0.5s)
═══ AutoCut: AI analysis ═══
  AI marked 8 additional segments
═══ AutoCut: Cutting ═══
  ✅ AutoCut complete: /tmp/demo/cut.mp4
```

**封面图 (1280x720)** — 自动提取标题 + 品牌色渲染

![封面图示例](examples/4_thumbnail.png)

**金句卡片 (1080x1080)** — 从转录中提取核心金句，Chrome Headless 渲染

![金句卡片示例](examples/4_card_1.png)

## 7 个能力

| 能力 | 做什么 | 命令 |
|------|--------|------|
| **transcribe** | 语音→文字 (Whisper) | `videocut transcribe input.mp4 -o out/` |
| **autocut** | 去语气词/停顿/口误 | `videocut autocut input.mp4 -o out/ --no-review` |
| **subtitle** | 检测/生成/烧录字幕 | `videocut subtitle input.mp4 -o out/` |
| **hook** | 提取金句 + 切视频片段 | `videocut hook input.mp4 -o out/ --count 4` |
| **clip** | 长视频拆短视频 (章节级) | `videocut clip input.mp4 -o out/` |
| **cover** | 封面 + 金句卡片 | `videocut cover -o out/ --quotes hooks.json` |
| **speed** | 变速 (1.1x-1.2x) | `videocut speed input.mp4 -o out/ --rate 1.1` |

每个能力独立可用，也可通过 pipeline 串联：

```bash
videocut pipeline input.mp4 --steps autocut,speed,subtitle,hook,cover -o output/
```

## 架构

```
                        node cli.js <capability> [args]
                                    │
              ┌──────────┬──────────┼──────────┬──────────┐
              ▼          ▼          ▼          ▼          ▼
         transcribe  autocut   subtitle    hook       clip   cover  speed
              │          │          │          │          │     │      │
              │     ┌────┴────┐     │     ┌────┴────┐    │     │      │
              ▼     ▼         ▼     ▼     ▼         ▼    ▼     ▼      ▼
           Whisper  Claude  cut.sh  burn.sh  match.js  split.sh  Chrome  FFmpeg
                    (AI分析) (FFmpeg)        (SRT匹配) (FFmpeg)  截图    atempo

共享库: lib/ffmpeg.js  lib/srt.js  lib/claude.js
```

**设计原则:** Node.js 做数据处理（JSON/SRT/AI 调用），Bash 做 FFmpeg 命令。两种语言边界清晰，不互相内联。

## 快速开始

```bash
# 安装系统依赖
brew install ffmpeg node
pip install openai-whisper
# Claude CLI: https://docs.anthropic.com/en/docs/claude-cli

# 克隆（零 npm 依赖，不需要 npm install）
git clone https://github.com/zinan92/videocut.git
cd videocut

# 最常用：剪口播 + 加字幕
node cli.js pipeline input.mp4 --steps autocut,subtitle -o output/ --no-review

# 单独用某个能力
node cli.js hook input.mp4 -o output/ --count 4
```

## 能力详解

### Transcribe

语音转文字。Whisper 本地转录，输出逐词 JSON + 纯文本 + SRT。

```bash
node cli.js transcribe input.mp4 -o output/ --model small
# → output/transcript.json, transcript.txt, transcript.srt
```

### AutoCut

AI 分析口误 + 静音检测，自动粗剪。9 条可扩展规则（语气词、卡顿词、重复句、残句等）。

```bash
node cli.js autocut input.mp4 -o output/ --no-review
# → output/cut.mp4, cut_feedback.json
```

自定义规则：往 `capabilities/autocut/rules/` 加 `.md` 文件，AI 自动读取。

### Subtitle

检测视频是否有硬字幕。没有则转录 + 生成 SRT + FFmpeg 烧录（PingFang SC 白字黑边）。

```bash
node cli.js subtitle cut.mp4 -o output/
# → output/subtitled.mp4, subtitle.srt
```

**关键设计：** 字幕对着输入视频重新转录，不做时间偏移。先 autocut 再 subtitle，字幕天然对齐。

### Hook

AI 选金句 → SRT 逐字匹配定位时间段 → FFmpeg 切片 + 拼接。

```bash
node cli.js hook input.mp4 -o output/ --count 4
# → output/hooks.json, hook.mp4, hook_segments/
```

匹配算法：字符级精确匹配 + 最长公共子串模糊 fallback，过滤语速/时长/重叠，太短自动扩展到 3s。

### Clip

AI 章节分析（2-5 分钟粒度，语义断句）→ FFmpeg 分段切割。

```bash
node cli.js clip input.mp4 -o output/ --min-duration 120 --max-duration 300
# → output/chapters.json, clips/*.mp4
```

### Cover

从金句生成 1080x1080 卡片 PNG（Chrome Headless 截图）。

```bash
node cli.js cover -o output/ --quotes output/hooks.json
# → output/card_1.png, card_2.png, ...
```

### Speed

变速播放，音高不变。默认 1.1x，上限 1.2x。

```bash
node cli.js speed input.mp4 -o output/ --rate 1.1
# → output/speed.mp4
```

## Pipeline 模式

串联多个能力，共享输出目录：

```bash
# 最常用
node cli.js pipeline input.mp4 --steps autocut,subtitle -o output/

# 完整生产
node cli.js pipeline input.mp4 --steps autocut,speed,subtitle,hook,cover -o output/
```

推荐顺序：`autocut → speed → subtitle → hook → clip → cover`

## 项目结构

```
videocut/
├── cli.js                     # 统一 CLI 入口
├── pipeline.js                # 能力串联
├── package.json               # 零依赖
├── capabilities/
│   ├── transcribe/            # 语音转文字
│   │   ├── index.js
│   │   ├── whisper.sh
│   │   └── SKILL.md
│   ├── autocut/               # 粗剪
│   │   ├── index.js
│   │   ├── cut.sh
│   │   ├── rules/             # 9 条 AI 分析规则
│   │   └── SKILL.md
│   ├── subtitle/              # 字幕
│   ├── hook/                  # 金句
│   ├── clip/                  # 拆条
│   ├── cover/                 # 封面卡片
│   └── speed/                 # 变速
├── lib/
│   ├── ffmpeg.js              # FFmpeg 封装
│   ├── srt.js                 # SRT 解析/生成/合并
│   └── claude.js              # AI 调用 + 重试
├── tests/                     # 91 tests
└── web/                       # Web Dashboard (React + Express)
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| CLI | Node.js 18+ (built-ins only) | 编排 + 数据处理 |
| AI | Claude CLI | 口误分析、金句选择、章节分析 |
| 转录 | Whisper | 本地语音转文字 |
| 音视频 | FFmpeg | 剪辑、字幕烧录、变速、切片 |
| 截图 | Chrome Headless | 封面 + 金句卡片 |
| 前端 | React 18 + Vite + Tailwind | Web Dashboard |

零 npm 依赖。clone 即用。

## For AI Agents

每个能力有独立的 `SKILL.md`，读 `capabilities/<name>/SKILL.md` 获取详细用法。

### Capability Contract

```yaml
name: videocut
version: 2.0.0
capability:
  summary: 7 independent video editing capabilities for spoken-word content
  in: video file (mp4/mov)
  out: edited video + subtitles + hook clips + cover cards + chapter clips
  fail:
    - "file not found → exit 1"
    - "dependency missing → error + install instructions"
    - "AI call failed → fallback to silence detection (autocut) or skip (hook/clip)"
cli_command: node cli.js
cli_args:
  - name: capability
    type: string
    required: true
    description: "transcribe | autocut | subtitle | hook | clip | cover | speed | pipeline"
  - name: input
    type: string
    required: false
    description: "输入视频文件路径"
cli_flags:
  - name: -o
    type: string
    description: "输出目录"
  - name: --no-review
    type: boolean
    description: "跳过审核 UI (autocut)"
  - name: --steps
    type: string
    description: "pipeline 步骤 (逗号分隔)"
  - name: --count
    type: number
    description: "金句数量 (hook)"
  - name: --rate
    type: number
    description: "变速倍率 (speed, 1.0-1.2)"
  - name: --model
    type: string
    description: "Whisper 模型 (tiny/base/small/medium/large)"
```

### Agent 调用示例

```python
import subprocess

# 口播视频 → 粗剪 + 加字幕
result = subprocess.run(
    ["node", "cli.js", "pipeline", "input.mp4",
     "--steps", "autocut,subtitle", "-o", "output/", "--no-review"],
    capture_output=True, text=True, cwd="/path/to/videocut"
)

# 提取金句
result = subprocess.run(
    ["node", "cli.js", "hook", "input.mp4", "-o", "output/", "--count", "4"],
    capture_output=True, text=True, cwd="/path/to/videocut"
)
```

## 相关项目

| 项目 | 说明 | 链接 |
|------|------|------|
| content-toolkit | 统一内容流水线 CLI（videocut 是其中的 stage 6） | [zinan92/content-toolkit](https://github.com/zinan92/content-toolkit) |
| content-downloader | 统一内容下载器 | [zinan92/content-downloader](https://github.com/zinan92/content-downloader) |
| content-rewriter | 跨平台内容改写 | [zinan92/content-rewriter](https://github.com/zinan92/content-rewriter) |

## License

MIT
