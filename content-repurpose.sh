#!/bin/bash
#
# content-repurpose.sh — 一键内容降维
#
# 用法: ./content-repurpose.sh <output_dir> [video_path]
#   output_dir: videocut 输出目录（如 ./output/2026-02-26_xxx/）
#   video_path: 原视频路径（可选，不填则自动推断）
#
# 输出到 output_dir/4_内容降维/:
#   article_cn.md  — 中文文章（公众号/即刻风格）
#   article_en.md  — 英文文章（Medium/Substack 风格）
#   podcast.mp3    — 规范化音频（-16 LUFS）
#   quotes.json    — 3-5 句金句
#

set -e

OUTPUT_DIR="$1"
VIDEO_PATH="$2"

if [ -z "$OUTPUT_DIR" ]; then
  echo "用法: ./content-repurpose.sh <output_dir> [video_path]"
  echo "示例: ./content-repurpose.sh ./output/2026-02-26_img_0574.mov/"
  exit 1
fi

# Resolve to absolute path
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
TRANSCRIPT_JSON="$OUTPUT_DIR/1_转录/volcengine_result.json"
REPURPOSE_DIR="$OUTPUT_DIR/4_内容降维"

if [ ! -f "$TRANSCRIPT_JSON" ]; then
  echo "❌ 找不到转录文件: $TRANSCRIPT_JSON"
  exit 1
fi

mkdir -p "$REPURPOSE_DIR"

echo "🎬 content-repurpose — 一键内容降维"
echo "📂 输入: $OUTPUT_DIR"
echo "📂 输出: $REPURPOSE_DIR"
echo ""

# ─── 步骤 A: 提取纯文字转录稿 ───────────────────────────────────────────────
echo "═══ 步骤 A: 提取转录文字 ═══"
TRANSCRIPT=$(python3 -c "
import json
with open('$TRANSCRIPT_JSON', 'r') as f:
    d = json.load(f)
text = '\n'.join(u['text'] for u in d['utterances'])
print(text)
")
echo "$TRANSCRIPT" > "$REPURPOSE_DIR/transcript.txt"
WORD_COUNT=$(echo "$TRANSCRIPT" | wc -c | tr -d ' ')
echo "✅ transcript.txt (${WORD_COUNT} chars)"

# ─── 步骤 B: 中文文章（公众号/即刻风格）──────────────────────────────────────
echo ""
echo "═══ 步骤 B: 生成中文文章 ═══"
CN_PROMPT="你是一位专业的内容创作者，擅长公众号和即刻文章写作。

下面是一段视频的口语转录稿，请将其改写为高质量的中文文章。

要求：
- 风格：公众号/即刻，简洁有力，不啰嗦
- 去掉口语填充词和重复表达，提炼核心观点
- 加入吸引人的标题（# H1）和小节标题（## H2）
- 结构清晰，段落精炼
- 保留原有观点，不添加不存在的信息
- 输出纯 Markdown 格式，不要加任何解释

转录稿：

${TRANSCRIPT}"

echo "$CN_PROMPT" | claude -p --dangerously-skip-permissions > "$REPURPOSE_DIR/article_cn.md"
echo "✅ article_cn.md"

# ─── 步骤 C: 英文文章（Medium/Substack 风格）─────────────────────────────────
echo ""
echo "═══ 步骤 C: 生成英文文章 ═══"
EN_PROMPT="You are a professional writer for Medium and Substack.

Below is a Chinese spoken transcript from a video. Please rewrite it as a high-quality English article.

Requirements:
- Style: Medium/Substack — native English voice, NOT a translation
- Remove filler words, repetition, and conversational looseness
- Distill the core ideas into compelling prose
- Add an engaging title (# H1) and section headers (## H2)
- Clear structure, tight paragraphs
- Preserve the original ideas faithfully, don't add nonexistent information
- Output pure Markdown, no explanatory text

Transcript:

${TRANSCRIPT}"

echo "$EN_PROMPT" | claude -p --dangerously-skip-permissions > "$REPURPOSE_DIR/article_en.md"
echo "✅ article_en.md"

# ─── 步骤 D: 提取播客音频（-16 LUFS 规范化）─────────────────────────────────
echo ""
echo "═══ 步骤 D: 提取播客音频 ═══"

# Try to find video if not provided
if [ -z "$VIDEO_PATH" ]; then
  DIR_NAME=$(basename "$OUTPUT_DIR")
  # Dir format: YYYY-MM-DD_videoname.ext → extract videoname.ext
  VIDEO_NAME=$(echo "$DIR_NAME" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}_//')
  # Try common locations
  for CANDIDATE in \
    "$HOME/Downloads/$VIDEO_NAME" \
    "$HOME/Movies/$VIDEO_NAME" \
    "$HOME/Desktop/$VIDEO_NAME"; do
    if [ -f "$CANDIDATE" ]; then
      VIDEO_PATH="$CANDIDATE"
      echo "   (自动找到视频: $VIDEO_PATH)"
      break
    fi
  done
fi

if [ -n "$VIDEO_PATH" ] && [ -f "$VIDEO_PATH" ]; then
  # Extract audio from original video, strip video track, normalize to -16 LUFS
  ffmpeg -i "file:$VIDEO_PATH" \
    -vn \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
    -acodec libmp3lame -q:a 2 \
    -y "$REPURPOSE_DIR/podcast.mp3" 2>/dev/null
  echo "✅ podcast.mp3 (原视频提取，loudnorm -16 LUFS)"
else
  echo "   ⚠️  未找到原视频，从已有 audio.mp3 规范化..."
  AUDIO_SRC="$OUTPUT_DIR/1_转录/audio.mp3"
  if [ -f "$AUDIO_SRC" ]; then
    ffmpeg -i "$AUDIO_SRC" \
      -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
      -acodec libmp3lame -q:a 2 \
      -y "$REPURPOSE_DIR/podcast.mp3" 2>/dev/null
    echo "✅ podcast.mp3 (从 audio.mp3 规范化，loudnorm -16 LUFS)"
  else
    echo "❌ 无法提取音频（原视频和 audio.mp3 均不存在），跳过"
  fi
fi

# ─── 步骤 E: 提取金句 → quotes.json ──────────────────────────────────────────
echo ""
echo "═══ 步骤 E: 提取金句 ═══"
QUOTES_PROMPT='从下面的转录稿中提取 3-5 句最有价值的金句。

要求：
- 选择观点鲜明、有洞察力、值得单独传播的句子
- 可以适当润色使其更简洁有力（保持原意）
- 严格输出 JSON 数组，不要有任何其他文字、代码块标记或解释
- 格式：[{"quote": "金句内容", "context": "一句话背景说明"}]

转录稿：

'"${TRANSCRIPT}"

echo "$QUOTES_PROMPT" | claude -p --dangerously-skip-permissions > "$REPURPOSE_DIR/quotes.json"
echo "✅ quotes.json"

# ─── 步骤 F: 生成视频封面 + 元数据 ──────────────────────────────────────────
echo ""
echo "═══ 步骤 F: 生成视频元数据 + 封面 ═══"

ARTICLE_CN="$REPURPOSE_DIR/article_cn.md"
ARTICLE_CN_CONTENT=""
if [ -f "$ARTICLE_CN" ]; then
  ARTICLE_CN_CONTENT=$(cat "$ARTICLE_CN")
fi

META_PROMPT="你是专业的短视频运营专家，熟悉抖音、B站、YouTube 的内容策略。

以下是视频的口语转录稿和已整理好的中文文章，请根据内容生成视频元数据。

【转录稿】
${TRANSCRIPT}

【中文文章】
${ARTICLE_CN_CONTENT}

请严格输出以下 JSON 格式，不要有任何其他文字、代码块标记或解释：

{
  \"title_cn\": \"中文标题（抖音/B站风格，吸引点击，30字以内）\",
  \"title_en\": \"English title (YouTube style, under 80 chars)\",
  \"description_cn\": \"中文描述（3-5句，含关键词，适合B站/抖音简介）\",
  \"description_en\": \"English description (3-5 sentences, YouTube style)\",
  \"tags_cn\": [\"#AI\", \"#AGI\", \"#人工智能\"],
  \"tags_en\": [\"#AI\", \"#AGI\", \"#futureofwork\"],
  \"hook\": {
    \"cn\": \"开头3秒hook文案（中文，一句话，震撼/悬念/反常识，用于封面大字）\",
    \"en\": \"3-second hook (English, one sentence, for thumbnail text)\"
  }
}

要求：
- title_cn：抖音/B站风格，有冲击力，包含数字或反问，30字以内
- title_en：YouTube风格，利于SEO，<80字
- description_cn：3-5句，包含核心关键词，适合平台算法推荐
- description_en：3-5句，native English，YouTube简介风格
- tags_cn：8-12个中文标签，带#号
- tags_en：8-12个英文标签，带#号
- hook.cn：1句话，极度吸引眼球，适合放在封面大字（10-20字）
- hook.en：1 sentence, for thumbnail overlay text"

echo "$META_PROMPT" | claude -p --dangerously-skip-permissions > "$REPURPOSE_DIR/video_meta.json"
echo "✅ video_meta.json"

# ─── 步骤 F2: 生成封面图 thumbnail.png ──────────────────────────────────────
echo ""
echo "═══ 步骤 F2: 生成封面图 ═══"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

node - "$REPURPOSE_DIR/video_meta.json" "$REPURPOSE_DIR/thumbnail.png" "$CHROME" <<'THUMBNAIL_SCRIPT'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const [,, metaPath, outPath, chromeBin] = process.argv;

let meta;
try {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
} catch(e) {
  console.error('❌ 解析 video_meta.json 失败:', e.message);
  process.exit(1);
}

const hookCn = meta.hook && meta.hook.cn ? meta.hook.cn : (meta.title_cn || '');
const titleCn = meta.title_cn || '';

const escaped = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 1280px;
    height: 720px;
    overflow: hidden;
    background: #1a1a2e;
    font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC",
                 "Source Han Sans CN", -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 1280px;
    height: 720px;
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  }
  /* 光晕装饰 */
  .glow-left {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%);
    top: 50%;
    left: -100px;
    transform: translateY(-50%);
    pointer-events: none;
  }
  .glow-right {
    position: absolute;
    width: 400px;
    height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(15,52,96,0.6) 0%, transparent 70%);
    top: 50%;
    right: -50px;
    transform: translateY(-50%);
    pointer-events: none;
  }
  /* 左侧红色竖条 */
  .accent-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    background: linear-gradient(180deg, #e94560 0%, #ff6b8a 100%);
  }
  /* 顶部装饰线 */
  .top-line {
    position: absolute;
    top: 0;
    left: 8px;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #e94560 0%, transparent 60%);
    opacity: 0.6;
  }
  /* 网格装饰 */
  .grid-dots {
    position: absolute;
    right: 60px;
    top: 50px;
    width: 200px;
    height: 200px;
    opacity: 0.06;
    background-image: radial-gradient(circle, #e94560 1px, transparent 1px);
    background-size: 20px 20px;
  }
  /* 主内容 */
  .content {
    position: absolute;
    left: 80px;
    right: 80px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 28px;
  }
  /* hook 大字 */
  .hook {
    color: #ffffff;
    font-size: 72px;
    font-weight: 900;
    line-height: 1.25;
    letter-spacing: 0.02em;
    text-shadow: 0 4px 30px rgba(233,69,96,0.4), 0 2px 8px rgba(0,0,0,0.8);
    word-break: break-all;
    max-width: 900px;
  }
  /* 红色下划线装饰 */
  .hook-underline {
    width: 80px;
    height: 5px;
    background: linear-gradient(90deg, #e94560 0%, #ff6b8a 100%);
    border-radius: 3px;
    margin-top: -10px;
  }
  /* 副标题（文章标题） */
  .subtitle {
    color: rgba(255,255,255,0.55);
    font-size: 28px;
    font-weight: 400;
    line-height: 1.5;
    letter-spacing: 0.01em;
    max-width: 800px;
  }
  /* 顶部 logo 文字 */
  .brand {
    position: absolute;
    top: 36px;
    left: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e94560;
  }
  .brand-text {
    color: rgba(255,255,255,0.4);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* 水印 */
  .watermark {
    position: absolute;
    bottom: 36px;
    right: 50px;
    color: rgba(255,255,255,0.35);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  /* 底部装饰条 */
  .bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #e94560 0%, transparent 60%);
    opacity: 0.4;
  }
</style>
</head>
<body>
<div class="card">
  <div class="glow-left"></div>
  <div class="glow-right"></div>
  <div class="accent-bar"></div>
  <div class="top-line"></div>
  <div class="grid-dots"></div>
  <div class="bottom-bar"></div>

  <div class="brand">
    <div class="brand-dot"></div>
    <div class="brand-text">xparkzz</div>
  </div>

  <div class="content">
    <div class="hook">${escaped(hookCn)}</div>
    <div class="hook-underline"></div>
    <div class="subtitle">${escaped(titleCn)}</div>
  </div>

  <div class="watermark">@xparkzz</div>
</div>
</body>
</html>`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnail-'));
const htmlPath = path.join(tmpDir, 'thumbnail.html');
fs.writeFileSync(htmlPath, html, 'utf8');

try {
  execSync(`"${chromeBin}" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --disable-extensions \
    --hide-scrollbars \
    --window-size=1280,720 \
    --screenshot="${outPath}" \
    "file://${htmlPath}" \
    2>/dev/null`, { stdio: 'pipe' });
  console.log('✅ thumbnail.png (1280x720)');
} catch(e) {
  console.error('❌ 截图失败:', e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
THUMBNAIL_SCRIPT

# ─── 完成 ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo "✅ 内容降维完成"
echo "📂 $REPURPOSE_DIR"
echo ""
ls -lh "$REPURPOSE_DIR"
