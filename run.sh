#!/bin/bash
#
# videocut 一键处理
#
# 用法: ./run.sh <video.mp4> [whisper_model] [--no-server]
#   whisper_model: tiny/base/small/medium/large (默认 small)
#   --no-server: 跳过审核服务器，直接剪辑
#

set -e

VIDEO_PATH="$1"
MODEL="${2:-small}"
NO_SERVER=false

if [ -z "$VIDEO_PATH" ]; then
  echo "用法: ./run.sh <video.mp4> [whisper_model] [--no-server]"
  exit 1
fi

# Handle --no-server flag in any position
for arg in "$@"; do
  if [ "$arg" = "--no-server" ]; then
    NO_SERVER=true
  fi
done

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ 找不到视频: $VIDEO_PATH"
  exit 1
fi

# Resolve absolute path
VIDEO_PATH="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"

SCRIPT_DIR="$(cd "$(dirname "$0")/剪口播/scripts" && pwd)"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
# Use absolute path so BASE_DIR stays valid after any cd into subdirectories
BASE_DIR="$(cd "$(dirname "$0")" && pwd)/output/${DATE}_${VIDEO_NAME}"

echo "🎬 videocut — 一键处理"
echo "📹 视频: $VIDEO_PATH"
echo "📂 输出: $BASE_DIR"
echo ""

# Step 0: Create dirs
mkdir -p "$BASE_DIR/1_转录" "$BASE_DIR/2_分析" "$BASE_DIR/3_审核"

# Step 1: Extract audio
echo "═══ 步骤 1: 提取音频 ═══"
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y "$BASE_DIR/1_转录/audio.mp3" 2>/dev/null
echo "✅ audio.mp3"

# Step 2: Whisper transcribe
echo ""
echo "═══ 步骤 2: Whisper 转录 (model: $MODEL) ═══"
cd "$BASE_DIR/1_转录"
"$SCRIPT_DIR/whisper_transcribe.sh" audio.mp3 "$MODEL"

# Step 3: Generate word-level subtitles
echo ""
echo "═══ 步骤 3: 生成字级别字幕 ═══"
node "$SCRIPT_DIR/generate_subtitles.js" volcengine_result.json

# Step 4: Analysis
echo ""
echo "═══ 步骤 4: 分析 ═══"
cd "$BASE_DIR/2_分析"

# readable.txt
node -e "
const data = require('../1_转录/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[静' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\n'));
console.log('📝 readable.txt:', output.length, 'lines');
"

# sentences.txt
node -e "
const data = require('../1_转录/subtitles_words.json');
let sentences = [], curr = { text: '', startIdx: -1, endIdx: -1 };
data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);
const lines = sentences.map((s, i) => i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text);
require('fs').writeFileSync('sentences.txt', lines.join('\n'));
console.log('📝 sentences.txt:', sentences.length, 'sentences');
"

# Auto-mark silence
node -e "
const words = require('../1_转录/subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('auto_selected.json', JSON.stringify(selected, null, 2));
console.log('🔇 auto_selected.json: ≥0.5s静音', selected.length, '段');
"

echo ""
echo "⚠️  AI 口误分析需要手动执行（读规则 + 分段分析 readable.txt）"
echo "    或直接用当前静音标记继续剪辑"

# Step 5: Generate review page
echo ""
echo "═══ 步骤 5: 生成审核网页 ═══"
cd "$BASE_DIR/3_审核"
node "$SCRIPT_DIR/generate_review.js" \
  ../1_转录/subtitles_words.json \
  ../2_分析/auto_selected.json \
  ../1_转录/audio.mp3

if [ "$NO_SERVER" = true ]; then
  echo ""
  echo "═══ 步骤 6: 直接剪辑（跳过审核）═══"
  
  # Convert idx list to time segments
  node -e "
  const words = require('../1_转录/subtitles_words.json');
  const selected = require('../2_分析/auto_selected.json');
  const segs = [];
  for (const idx of selected) {
    const w = words[idx];
    if (w) segs.push({ start: w.start, end: w.end });
  }
  segs.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const seg of segs) {
    if (merged.length && seg.start <= merged[merged.length-1].end + 0.05) {
      merged[merged.length-1].end = Math.max(merged[merged.length-1].end, seg.end);
    } else merged.push({...seg});
  }
  require('fs').writeFileSync('delete_segments.json', JSON.stringify(merged, null, 2));
  console.log('✂️ ', merged.length, 'segments,', merged.reduce((s,x) => s + x.end - x.start, 0).toFixed(1) + 's to delete');
  "
  
  bash "$SCRIPT_DIR/cut_video.sh" "$VIDEO_PATH" delete_segments.json "$BASE_DIR/output_cut.mp4"
else
  echo ""
  echo "═══ 步骤 6: 启动审核服务器 ═══"
  echo "🌐 http://localhost:8899"
  echo "   播放 → 确认 → 点击「执行剪辑」"
  echo ""
  node "$SCRIPT_DIR/review_server.js" 8899 "$VIDEO_PATH"
fi
