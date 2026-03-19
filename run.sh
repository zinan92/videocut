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
BASE_DIR="$(cd "$(dirname "$0")" && pwd)/output/${DATE}_${VIDEO_NAME}"

echo "🎬 videocut — 一键处理"
echo "📹 视频: $VIDEO_PATH"
echo "📂 输出: $BASE_DIR"
echo ""

# Step 0: Create flat output dir
mkdir -p "$BASE_DIR"

# Step 1: Extract audio
echo "═══ 步骤 1: 提取音频 ═══"
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y "$BASE_DIR/1_audio.mp3" 2>/dev/null
echo "✅ 1_audio.mp3"

# Step 2: Whisper transcribe
# Must cd to BASE_DIR so whisper_transcribe.sh writes volcengine_result.json here
echo ""
echo "═══ 步骤 2: Whisper 转录 (model: $MODEL) ═══"
cd "$BASE_DIR"
"$SCRIPT_DIR/whisper_transcribe.sh" "1_audio.mp3" "$MODEL"
mv "volcengine_result.json" "1_volcengine_result.json"

# Step 3: Generate word-level subtitles
# generate_subtitles.js writes subtitles_words.json to cwd ($BASE_DIR)
echo ""
echo "═══ 步骤 3: 生成字级别字幕 ═══"
node "$SCRIPT_DIR/generate_subtitles.js" "${BASE_DIR}/1_volcengine_result.json"
mv "${BASE_DIR}/subtitles_words.json" "${BASE_DIR}/1_subtitles_words.json"

# Step 4: Analysis
echo ""
echo "═══ 步骤 4: 分析 ═══"

# 2_readable.txt
node -e "
const data = require('${BASE_DIR}/1_subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[静' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('${BASE_DIR}/2_readable.txt', output.join('\n'));
console.log('📝 2_readable.txt:', output.length, 'lines');
"

# 2_sentences.txt
node -e "
const data = require('${BASE_DIR}/1_subtitles_words.json');
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
require('fs').writeFileSync('${BASE_DIR}/2_sentences.txt', lines.join('\n'));
console.log('📝 2_sentences.txt:', sentences.length, 'sentences');
"

# Auto-mark silence → 2_auto_selected.json
node -e "
const words = require('${BASE_DIR}/1_subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('${BASE_DIR}/2_auto_selected.json', JSON.stringify(selected, null, 2));
console.log('🔇 2_auto_selected.json: ≥0.5s静音', selected.length, '段');
"

# Step 4b: AI 口误分析
echo ""
echo "═══ 步骤 4b: AI 口误分析 ═══"

# 运行 feedback aggregator（如果有历史反馈）
FEEDBACK_AGG="$(cd "$(dirname "$0")/剪口播/scripts" && pwd)/feedback_aggregator.js"
if [[ -f "$FEEDBACK_AGG" ]]; then
  node "$FEEDBACK_AGG" 2>/dev/null || true
fi

RULES_DIR="$(cd "$(dirname "$0")/剪口播/用户习惯" && pwd)"

# Build rules context
RULES_CONTEXT=""
for rule_file in "$RULES_DIR"/[1-9]*.md; do
  RULES_CONTEXT+="$(cat "$rule_file")"$'\n\n'
done

# 加载用户修正反馈（如果存在）
FEEDBACK_CONTEXT=""
FEEDBACK_FILE="$(cd "$(dirname "$0")/剪口播/用户习惯" && pwd)/feedback_examples.md"
if [[ -f "$FEEDBACK_FILE" ]]; then
  FEEDBACK_CONTEXT=$(cat "$FEEDBACK_FILE")
fi

# Build prompt for AI analysis
AI_PROMPT="你是视频口误分析专家。根据以下规则，分析 readable.txt 和 sentences.txt，找出所有应该删除的片段。

## 规则
${RULES_CONTEXT}

## 用户历史修正反馈
${FEEDBACK_CONTEXT}

## readable.txt（idx|内容|时间范围）
$(cat "${BASE_DIR}/2_readable.txt")

## sentences.txt（句号|startIdx-endIdx|句子文本）
$(cat "${BASE_DIR}/2_sentences.txt")

## 当前已标记的静音段（idx 列表）
$(cat "${BASE_DIR}/2_auto_selected.json")

## 输出要求

分析完成后，输出一个 JSON 数组，包含所有应该**新增**删除的 idx（不要包含已在 auto_selected.json 中的静音段）。

格式：纯 JSON 数组，不要代码围栏，不要解释。
例如：[12, 13, 14, 28, 29, 30]

每个 idx 对应 readable.txt 中的 idx 值（第一列）。如果要删整句，列出句子范围内的所有 idx。

重要：
- 行号 ≠ idx，用 readable.txt 第一列的 idx 值
- 删前保后：后说的通常更完整
- 残句要整句删除（startIdx 到 endIdx 的所有 idx）
- 不要删除正常内容，宁可漏删不可误删"

echo "$AI_PROMPT" | claude -p --dangerously-skip-permissions --output-format text > "${BASE_DIR}/2_ai_analysis_raw.txt" 2>/dev/null

# Parse AI output: extract JSON array, merge with auto_selected
node -e "
const fs = require('fs');
const autoSelected = JSON.parse(fs.readFileSync('${BASE_DIR}/2_auto_selected.json', 'utf8'));

// Extract JSON array from AI output
let raw = fs.readFileSync('${BASE_DIR}/2_ai_analysis_raw.txt', 'utf8').trim();
// Strip code fences if present
raw = raw.replace(/^\`\`\`[a-z]*\n?/m, '').replace(/\n?\`\`\`\s*$/m, '').trim();

let aiIdx = [];
try {
  aiIdx = JSON.parse(raw);
  if (!Array.isArray(aiIdx)) aiIdx = [];
  // Filter to valid integers only
  aiIdx = aiIdx.filter(x => Number.isInteger(x) && x >= 0);
} catch(e) {
  console.error('⚠️  AI 分析输出解析失败，仅使用静音标记');
  console.error('Raw output:', raw.slice(0, 200));
}

// Merge and deduplicate
const merged = [...new Set([...autoSelected, ...aiIdx])].sort((a,b) => a - b);
fs.writeFileSync('${BASE_DIR}/2_auto_selected.json', JSON.stringify(merged, null, 2));
console.log('🤖 AI 口误分析: 新增', aiIdx.length, '个标记');
console.log('📊 合并后总计:', merged.length, '个删除标记 (静音', autoSelected.length, '+ AI', aiIdx.length, ')');
"

# Step 5: Generate review page
# generate_review.js writes review.html and audio.mp3 to cwd ($BASE_DIR)
echo ""
echo "═══ 步骤 5: 生成审核网页 ═══"
node "$SCRIPT_DIR/generate_review.js" \
  "${BASE_DIR}/1_subtitles_words.json" \
  "${BASE_DIR}/2_auto_selected.json" \
  "${BASE_DIR}/1_audio.mp3"
mv "${BASE_DIR}/review.html" "${BASE_DIR}/3_review.html"

# 预生成 SRT（剪辑完成后可用于烧录）
if [[ -f "${BASE_DIR}/1_subtitles_words.json" ]]; then
  node "$SCRIPT_DIR/generate_srt.js" "${BASE_DIR}/1_subtitles_words.json" "${BASE_DIR}/1_subtitles.srt"
fi

if [ "$NO_SERVER" = true ]; then
  echo ""
  echo "═══ 步骤 6: 直接剪辑（跳过审核）═══"

  # Convert idx list to time segments → 3_delete_segments.json
  node -e "
  const words = require('${BASE_DIR}/1_subtitles_words.json');
  const selected = require('${BASE_DIR}/2_auto_selected.json');
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
  require('fs').writeFileSync('${BASE_DIR}/3_delete_segments.json', JSON.stringify(merged, null, 2));
  console.log('✂️ ', merged.length, 'segments,', merged.reduce((s,x) => s + x.end - x.start, 0).toFixed(1) + 's to delete');
  "

  bash "$SCRIPT_DIR/cut_video.sh" "$VIDEO_PATH" "${BASE_DIR}/3_delete_segments.json" "${BASE_DIR}/3_output_cut.mp4"

  # Step 6b: 生成 SRT + 烧录字幕
  echo ""
  echo "═══ 步骤 6b: 烧录字幕 ═══"
  if [[ -f "${BASE_DIR}/1_subtitles_words.json" ]]; then
    # 生成 SRT
    node "$SCRIPT_DIR/generate_srt.js" "${BASE_DIR}/1_subtitles_words.json" "${BASE_DIR}/1_subtitles.srt"

    # 烧录字幕到剪辑后的视频
    if [[ -f "${BASE_DIR}/3_output_cut.mp4" && -f "${BASE_DIR}/1_subtitles.srt" ]]; then
      echo "🔤 烧录字幕到视频..."
      ffmpeg -y -i "${BASE_DIR}/3_output_cut.mp4" \
        -vf "subtitles='${BASE_DIR}/1_subtitles.srt':force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=30'" \
        -c:a copy \
        "${BASE_DIR}/3_output_subtitled.mp4" 2>/dev/null

      if [[ -f "${BASE_DIR}/3_output_subtitled.mp4" ]]; then
        echo "✅ 3_output_subtitled.mp4 (带字幕)"
      else
        echo "⚠️ 字幕烧录失败，继续使用无字幕版本"
      fi
    fi
  else
    echo "⚠️ 缺少 1_subtitles_words.json，跳过字幕"
  fi

  # 保存基线 feedback（无用户修正）
  node -e "
  const fs = require('fs');
  const feedback = {
    timestamp: new Date().toISOString(),
    mode: 'no-server',
    ai_selected_count: JSON.parse(fs.readFileSync('${BASE_DIR}/2_auto_selected.json', 'utf8')).length,
    user_selected_count: JSON.parse(fs.readFileSync('${BASE_DIR}/2_auto_selected.json', 'utf8')).length,
    ai_over_deleted: [],
    ai_under_deleted: [],
    note: 'Auto mode (--no-server), no user corrections'
  };
  fs.writeFileSync('${BASE_DIR}/3_feedback.json', JSON.stringify(feedback, null, 2));
  console.log('📊 Baseline feedback saved (no user review)');
  "
else
  echo ""
  echo "═══ 步骤 6: 启动审核服务器 ═══"
  echo "🌐 http://localhost:8899/3_review.html"
  echo "   播放 → 确认 → 点击「执行剪辑」"
  echo ""
  node "$SCRIPT_DIR/review_server.js" 8899 "$VIDEO_PATH"
fi
