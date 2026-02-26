# videocut

视频自动剪辑 + 内容降维工具 — 录一次视频，自动出 7 种内容

Fork from [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills)

## 一句话

```
🎬 2分钟口播 → 剪辑视频 + 中文文章 + 英文文章 + 播客音频 + 5张金句卡片 + 封面 + 元数据
```

## 快速开始

```bash
# Step 1: 视频粗剪（去停顿 + 去口误）
./run.sh video.mp4

# Step 2: 内容降维（文章/音频/卡片/封面/标签）
./content-repurpose.sh ./output/2026-02-26_video/
```

## 两个核心脚本

### `run.sh` — 视频粗剪

```
视频 → 提取音频 → Whisper 转录 → 字级别字幕
  → 静音标记 + AI 口误分析 → 审核网页 → FFmpeg 剪辑
```

```bash
./run.sh video.mp4              # 含审核网页
./run.sh video.mp4 small --no-server  # 跳过审核直接剪
./run.sh video.mp4 large        # 用大模型转录
```

### `content-repurpose.sh` — 一键内容降维

输入 run.sh 的输出目录，自动生成：

| 产出 | 文件 | 用途 |
|------|------|------|
| 中文文章 | `article_cn.md` | 公众号 / 即刻 / 小红书 |
| 英文文章 | `article_en.md` | Medium / Substack / X |
| 播客音频 | `podcast.mp3` | 小宇宙 / Apple Podcasts |
| 金句卡片 | `cards/card_*.png` | 小红书 / X / Instagram |
| 视频元数据 | `video_meta.json` | 标题/描述/标签 (中英双语) |
| 视频封面 | `thumbnail.png` | YouTube / B站 封面 |
| 纯文字稿 | `transcript.txt` | 二次创作素材 |

```bash
./content-repurpose.sh ./output/2026-02-26_video/
./content-repurpose.sh ./output/2026-02-26_video/ /path/to/original.mp4  # 指定原视频路径
```

### `generate-cards.sh` — 金句图文卡片

```bash
./generate-cards.sh ./output/2026-02-26_video/4_内容降维/quotes.json ./output/cards/
```

生成 1080x1080 深色风格图片卡，带 @xparkzz 水印。

## 依赖

- FFmpeg: `brew install ffmpeg`
- Whisper: `pip install openai-whisper`
- Node.js 18+: `brew install node`
- Claude CLI: 用于文章重写和元数据生成
- Chromium: 用于图片卡/封面截图（puppeteer/playwright）

## 目录结构

```
videocut/
├── run.sh                 # 视频粗剪入口
├── content-repurpose.sh   # 内容降维入口
├── generate-cards.sh      # 金句卡片生成
├── 剪口播/
│   ├── SKILL.md
│   └── scripts/
│       ├── whisper_transcribe.sh
│       ├── generate_subtitles.js
│       ├── generate_review.js
│       ├── review_server.js
│       └── cut_video.sh
├── 字幕/
│   └── scripts/
│       └── subtitle_server.js
└── 自进化/                 # 偏好自更新规则
```

## 输出示例

```
output/2026-02-26_video/
├── 1_转录/          # Whisper 转录结果
├── 2_分析/          # 静音标记 + 口误分析
├── 3_审核/          # 审核网页
├── 4_内容降维/
│   ├── transcript.txt
│   ├── article_cn.md
│   ├── article_en.md
│   ├── podcast.mp3
│   ├── quotes.json
│   ├── video_meta.json
│   ├── thumbnail.png
│   └── cards/
│       ├── card_1.png
│       ├── card_2.png
│       └── ...
└── final/           # 剪辑成片
```

## License

MIT
