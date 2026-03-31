<div align="center">

# Videocut

**AI 口播视频编辑能力集。7 个独立 CLI 工具，各自可用，也可串联成流水线。**

[![Node.js](https://img.shields.io/badge/node-18+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Audio%2FVideo-007808.svg?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![Claude CLI](https://img.shields.io/badge/Claude_CLI-AI_Engine-CC785C.svg?logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

```
in  视频文件 (mp4/mov) | 视频目录 (batch mode)
out 剪辑视频 + 字幕 + 金句片段 + 封面卡片 + 章节切片 + 变速视频

fail 视频文件不存在           → exit 1, 提示路径
fail ffmpeg/whisper/node 缺失 → exit 1, 依赖检查提示安装
fail Claude CLI 未认证       → AI 步骤 fallback (静音检测 / 均分切片 / 全文替代)
fail Chrome 未安装           → cover 能力跳过
fail 目录内无视频文件         → exit 1, 提示目录为空
```

## 示例输出

```bash
$ node cli.js pipeline ~/录制.mp4 --steps autocut,subtitle -o /tmp/demo/ --no-review

Pipeline steps: autocut → subtitle
Output dir: /tmp/demo/
[1/2] autocut
  Extracting audio...
  Transcribing (model: small)...
  Done: 42 subtitle entries
  12 silence segments (≥0.5s)
  AI marked 8 additional segments
  ✅ AutoCut complete: /tmp/demo/cut.mp4
[2/2] subtitle
  ✅ Subtitled: /tmp/demo/cut_subtitled.mp4
Pipeline complete.
```

**封面图 (1280x720)** — 自动提取标题 + 品牌色渲染

![封面图示例](examples/4_thumbnail.png)

**金句卡片 (1080x1080)** — 从转录中提取核心金句，Chrome Headless 渲染

![金句卡片示例](examples/4_card_1.png)

**Batch 模式** — 传目录，自动处理目录内所有视频：

```bash
$ node cli.js autocut ~/videos/ -o /tmp/batch/ --no-review

Found 3 video(s) in /Users/wendy/videos/
[1/3] lesson_01.mp4
[2/3] lesson_02.mp4
[3/3] lesson_03.mp4

Done: 3 succeeded, 0 failed
```

## 7 个能力

| 能力 | 做什么 | 命令 |
|------|--------|------|
| **transcribe** | 语音→文字 (Whisper) | `videocut transcribe input.mp4 -o out/` |
| **autocut** | 去语气词/停顿/口误 | `videocut autocut input.mp4 -o out/ --no-review` |
| **subtitle** | 检测/生成/烧录字幕 | `videocut subtitle input.mp4 -o out/` |
| **hook** | 提取金句 + 切视频片段 | `videocut hook input.mp4 -o out/ --count 4` |
| **clip** | 长视频拆短视频 (章节级) | `videocut clip input.mp4 -o out/` |
| **cover** | 封面 + 金句卡片 | `videocut cover -o out/ --quotes hooks.json` |
| **speed** | 变速 (1.0x-1.2x) | `videocut speed input.mp4 -o out/ --rate 1.1` |

每个能力独立可用，也可通过 pipeline 串联：

```bash
videocut pipeline input.mp4 --steps autocut,speed,subtitle,hook,cover -o output/
```

## CLI 帮助

```
videocut — AI-powered video editing for spoken-word content

Usage:
  videocut <capability> [input] [-o outputDir] [flags]

Capabilities:
  transcribe   Transcribe audio/video to text using Whisper
  autocut      Auto-cut silences and filler words
  subtitle     Burn subtitles into video
  hook         Generate a hook clip from the first N seconds
  clip         Extract a specific clip by timestamp range
  cover        Generate a cover image from a video frame
  speed        Change playback speed (e.g. --rate 1.5)
  pipeline     Run the full pipeline end-to-end

Examples:
  videocut transcribe input.mp4
  videocut autocut input.mp4 -o ./output
  videocut subtitle input.mp4 --lang zh
  videocut pipeline input.mp4 -o ./output --rate 1.2
  videocut pipeline ~/videos/ --steps autocut,subtitle -o ./batch/
  videocut help
```

## 架构

```
                      node cli.js <capability> [input] [flags]
                                  │
                          ┌───────┴───────┐
                          │  batch mode?  │
                          │  (目录输入)    │
                          └───────┬───────┘
                                  │
            ┌──────────┬──────────┼──────────┬──────────┐
            ▼          ▼          ▼          ▼          ▼
       transcribe  autocut   subtitle    hook       clip   cover  speed
            │          │          │          │          │     │      │
            │     ┌────┴────┐    │     ┌────┴────┐    │     │      │
            ▼     ▼         ▼    ▼     ▼         ▼    ▼     ▼      ▼
         Whisper  Claude  cut.sh burn.sh  match.js split.sh Chrome FFmpeg
                  (AI分析) (FFmpeg)       (SRT匹配) (FFmpeg) 截图   atempo

共享库: lib/ffmpeg.js  lib/srt.js  lib/claude.js
```

**Fallback 链:**

| 能力 | AI 成功 | AI 失败 fallback |
|------|---------|-----------------|
| autocut | Claude 标记口误词 | 仅用静音检测 |
| hook | AI 选金句 → SRT 匹配 | AI 失败→全文做金句；SRT 匹配失败→取前 10 秒 |
| clip | AI 章节分析 | 均分 ~120 秒切片 |
| cover | 读取 hooks.json | pipeline 自动喂 transcript.txt 前 200 字 |

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

# Batch 模式：处理整个目录
node cli.js pipeline ~/videos/ --steps autocut,subtitle -o output/
```

## 能力详解

### Transcribe

语音转文字。Whisper 本地转录，输出逐词 JSON + 纯文本 + SRT。

```bash
node cli.js transcribe input.mp4 -o output/ --model small
# → output/transcript.json, transcript.txt, transcript.srt
```

内置缓存：output 目录已有 `transcript.json` 时直接复用，不重复转录。

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
# → output/cut_subtitled.mp4, subtitle.srt
```

**关键设计：** 字幕对着输入视频重新转录，不做时间偏移。先 autocut 再 subtitle，字幕天然对齐。

### Hook

AI 选金句 → SRT 逐字匹配定位时间段 → FFmpeg 切片 + 拼接。

```bash
node cli.js hook input.mp4 -o output/ --count 4
# → output/hooks.json, 3_hook.mp4
```

匹配算法：字符级精确匹配 + 最长公共子串模糊 fallback，过滤语速/时长/重叠，太短自动扩展到 3s。

**Fallback 链：** AI 选金句失败→用全文做金句；SRT 匹配失败→取视频前 10 秒。

### Clip

AI 章节分析（2-5 分钟粒度，语义断句）→ FFmpeg 分段切割。

```bash
node cli.js clip input.mp4 -o output/ --min-duration 120 --max-duration 300
# → output/chapters.json, clips/*.mp4
```

**Fallback：** AI 章节检测失败→均分为 ~120 秒片段。

### Cover

从金句生成 1080x1080 卡片 PNG（Chrome Headless 截图）。接受 `{quote_text}` 和 `{quote}` 两种字段格式。

```bash
node cli.js cover -o output/ --quotes output/hooks.json
# → output/4_card_1.png, 4_card_2.png, ...
```

Pipeline 模式下自动从 `transcript.txt` 提取前 200 字作为 cover 文案。

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

# Batch + Pipeline
node cli.js pipeline ~/videos/ --steps autocut,subtitle -o output/
```

推荐顺序：`autocut → speed → subtitle → hook → clip → cover`

## 项目结构

```
videocut/
├── cli.js                     # 统一 CLI 入口 (batch mode + single file)
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
├── tests/                     # 测试
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

零 npm 依赖。clone 即用。

## For AI Agents

每个能力有独立的 `SKILL.md`，读 `capabilities/<name>/SKILL.md` 获取详细用法。

### Capability Contract

```yaml
name: videocut
version: 1.0.0
capability:
  summary: 7 independent video editing capabilities for spoken-word content
  in: video file (mp4/mov) or directory of video files (batch mode)
  out: edited video + subtitles + hook clips + cover cards + chapter clips
  fail:
    - "file not found → exit 1"
    - "dependency missing → error + install instructions"
    - "AI call failed → fallback: silence detection (autocut), even-split (clip), full transcript (hook), first 10s (hook SRT match)"
    - "no video files in directory → exit 1"
cli_command: node cli.js
cli_args:
  - name: capability
    type: string
    required: true
    description: "transcribe | autocut | subtitle | hook | clip | cover | speed | pipeline"
  - name: input
    type: string
    required: false
    description: "输入视频文件路径 或 视频目录路径 (batch mode)"
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
  - name: --min-duration
    type: number
    description: "最短片段时长秒 (clip)"
  - name: --max-duration
    type: number
    description: "最长片段时长秒 (clip)"
  - name: --text
    type: string
    description: "手动指定金句文本 (cover)"
  - name: --quotes
    type: string
    description: "金句 JSON 文件路径 (cover)"
  - name: --no-burn
    type: boolean
    description: "只生成 SRT 不烧录 (subtitle)"
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

# Batch 模式：处理整个目录
result = subprocess.run(
    ["node", "cli.js", "pipeline", "/path/to/videos/",
     "--steps", "autocut,subtitle", "-o", "output/"],
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
