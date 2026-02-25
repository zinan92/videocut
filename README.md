# videocut

视频自动剪辑工具 — Whisper 本地转录 + AI 口误识别 + 网页审核

Fork from [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills)，主要改动：
- 火山引擎 ASR → **Whisper 本地**（无需 API Key，无需上传音频）
- 新增 `run.sh` 一键处理脚本
- 清理硬编码路径

## 快速开始

```bash
# 一键处理（含审核网页）
./run.sh video.mp4

# 跳过审核直接剪辑
./run.sh video.mp4 small --no-server

# 指定 Whisper 模型
./run.sh video.mp4 large
```

## 流程

```
视频 → 提取音频 → Whisper 转录 → 字级别字幕
  → 自动静音标记 + AI 口误分析 → 审核网页 → FFmpeg 精确剪辑
```

## 依赖

- FFmpeg: `brew install ffmpeg`
- Whisper: `pip install openai-whisper`
- Node.js 18+: `brew install node`

## 目录结构

```
videocut/
├── run.sh              # 一键处理入口
├── 剪口播/
│   ├── SKILL.md        # 详细流程文档
│   ├── scripts/
│   │   ├── whisper_transcribe.sh   # Whisper 转录（替代火山引擎）
│   │   ├── generate_subtitles.js   # 字级别字幕生成
│   │   ├── generate_review.js      # 审核网页生成
│   │   ├── review_server.js        # 审核服务器
│   │   └── cut_video.sh            # FFmpeg 精确剪辑
│   └── 用户习惯/                    # 9条口误检测规则
│       ├── 1-核心原则.md
│       ├── 2-语气词检测.md
│       ├── 3-静音段处理.md
│       ├── 4-重复句检测.md
│       ├── 5-卡顿词.md
│       ├── 6-句内重复检测.md
│       ├── 7-连续语气词.md
│       ├── 8-重说纠正.md
│       └── 9-残句检测.md
├── 字幕/
│   └── scripts/
│       └── subtitle_server.js
└── 自进化/                          # 偏好自更新
```

## License

MIT (from original repo)
