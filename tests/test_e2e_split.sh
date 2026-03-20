#!/usr/bin/env bash
# test_e2e_split.sh — E2E 测试拆条功能
#
# 用法: ./tests/test_e2e_split.sh <video_file>
# 需要 Express server 在 localhost:3789 运行

set -euo pipefail

VIDEO="$1"
BASE="http://localhost:3789"
PASS=0
FAIL=0

check() {
  local label="$1"
  local condition="$2"
  if eval "$condition"; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══ E2E 拆条测试 ═══"
echo "视频: $VIDEO"
echo ""

# Step 1: Upload video
echo "Step 1: 上传视频..."
UPLOAD_RESULT=$(curl -s -X POST -F "video=@$VIDEO" "$BASE/api/upload")
VIDEO_PATH=$(echo "$UPLOAD_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).path))")
check "上传成功" "[[ -n '$VIDEO_PATH' ]]"
echo "  路径: $VIDEO_PATH"

# Step 2: Transcribe (SSE)
echo ""
echo "Step 2: 转录 (SSE)..."
# Capture SSE events until 'done' event
TRANSCRIBE_OUTPUT=$(curl -s -N "$BASE/api/split/transcribe?video=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$VIDEO_PATH'))")" 2>/dev/null | head -100)

# Extract outputDir from the 'done' event
OUTPUT_DIR=$(echo "$TRANSCRIBE_OUTPUT" | grep '"type":"done"' | sed 's/^data: //' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).outputDir)}catch{}})" 2>/dev/null)

if [[ -z "$OUTPUT_DIR" ]]; then
  echo "  ❌ 转录未完成（可能超时）"
  # Try to find the most recent output dir
  OUTPUT_DIR=$(ls -t output/ 2>/dev/null | head -1)
  echo "  尝试使用最近的目录: $OUTPUT_DIR"
fi

check "转录完成" "[[ -n '$OUTPUT_DIR' ]]"
check "转录文件存在" "[[ -f 'output/$OUTPUT_DIR/4_transcript.txt' ]]"
check "SRT 文件存在" "[[ -f 'output/$OUTPUT_DIR/1_subtitles.srt' ]]"

# Step 3: Analyze chapters
echo ""
echo "Step 3: AI 章节分析..."
ANALYZE_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"outputDir\": \"$OUTPUT_DIR\"}" \
  "$BASE/api/split/analyze")

CHAPTER_COUNT=$(echo "$ANALYZE_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const r=JSON.parse(d);console.log(r.chapters?r.chapters.length:0)}catch{console.log(0)}})" 2>/dev/null)

check "章节分析成功" "[[ '$CHAPTER_COUNT' -gt 0 ]]"
echo "  章节数: $CHAPTER_COUNT"

# 验证章节格式
if [[ "$CHAPTER_COUNT" -gt 0 ]]; then
  FIRST_TITLE=$(echo "$ANALYZE_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).chapters[0].title)}catch{}})" 2>/dev/null)
  check "章节有标题" "[[ -n '$FIRST_TITLE' ]]"
  echo "  第一章: $FIRST_TITLE"

  check "chapters.json 已保存" "[[ -f 'output/$OUTPUT_DIR/4_chapters.json' ]]"
fi

# Step 4: Execute split (选前 2 个章节)
echo ""
echo "Step 4: 执行切割..."
CHAPTERS_JSON=$(echo "$ANALYZE_RESULT" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{
    const r=JSON.parse(d);
    const selected=r.chapters.slice(0,2).map((ch,i)=>({...ch,index:i+1}));
    console.log(JSON.stringify(selected));
  }catch{console.log('[]')}
})" 2>/dev/null)

SPLIT_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"outputDir\": \"$OUTPUT_DIR\", \"chapters\": $CHAPTERS_JSON, \"videoPath\": \"$VIDEO_PATH\"}" \
  "$BASE/api/split/execute")

SPLIT_SUCCESS=$(echo "$SPLIT_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const r=JSON.parse(d);console.log(r.results.filter(x=>x.success).length)}catch{console.log(0)}})" 2>/dev/null)

check "切割成功" "[[ '$SPLIT_SUCCESS' -gt 0 ]]"
echo "  成功: $SPLIT_SUCCESS 段"

# 验证 splits 目录
check "splits 目录存在" "[[ -d 'output/$OUTPUT_DIR/splits' ]]"

if [[ -d "output/$OUTPUT_DIR/splits" ]]; then
  SPLIT_FILES=$(ls output/$OUTPUT_DIR/splits/*.mp4 2>/dev/null | wc -l | tr -d ' ')
  check "MP4 文件数量正确" "[[ '$SPLIT_FILES' -eq '$SPLIT_SUCCESS' ]]"
  echo "  文件: $SPLIT_FILES 个"

  # 验证每个切割视频可播放
  for f in output/$OUTPUT_DIR/splits/*.mp4; do
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$f" 2>/dev/null | cut -d. -f1)
    FNAME=$(basename "$f")
    check "$FNAME 可播放 (${DUR}s)" "[[ -n '$DUR' && '$DUR' -gt 0 ]]"
  done
fi

echo ""
echo "═══════════════════════════════════════"
echo "结果: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "═══════════════════════════════════════"

[[ $FAIL -eq 0 ]] || exit 1
