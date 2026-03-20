#!/usr/bin/env bash
# test_e2e_verify.sh — 验证 pipeline 输出完整性
#
# 用法: ./tests/test_e2e_verify.sh <output_dir>

set -euo pipefail

DIR="$1"
PASS=0
FAIL=0
WARN=0

check_file() {
  local file="$1"
  local label="$2"
  local min_size="${3:-1}"  # minimum bytes

  if [[ -f "$DIR/$file" ]]; then
    local size
    size=$(wc -c < "$DIR/$file" | tr -d ' ')
    if [[ $size -ge $min_size ]]; then
      echo "  ✅ $label ($size bytes)"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $label — 文件太小 ($size bytes, 期望 >=$min_size)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  ❌ $label — 文件不存在"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local file="$1"
  local label="$2"

  if [[ -f "$DIR/$file" ]]; then
    if node -e "JSON.parse(require('fs').readFileSync('$DIR/$file','utf8'))" 2>/dev/null; then
      echo "  ✅ $label (valid JSON)"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $label — JSON 解析失败"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  ❌ $label — 文件不存在"
    FAIL=$((FAIL + 1))
  fi
}

check_video() {
  local file="$1"
  local label="$2"

  if [[ -f "$DIR/$file" ]]; then
    local dur
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$DIR/$file" 2>/dev/null | cut -d. -f1)
    if [[ -n "$dur" && "$dur" -gt 0 ]]; then
      echo "  ✅ $label (${dur}s)"
      PASS=$((PASS + 1))
    else
      echo "  ❌ $label — 无法读取时长"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "  ❌ $label — 文件不存在"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══ E2E 验证: $DIR ═══"
echo ""

echo "Phase 1: 转录 + 剪辑"
check_file "1_audio.mp3" "音频提取" 10000
check_json "1_volcengine_result.json" "Whisper 转录"
check_json "1_subtitles_words.json" "字级别字幕"
check_file "1_subtitles.srt" "SRT 字幕" 50
check_file "2_readable.txt" "可读转录" 100
check_file "2_sentences.txt" "句子列表" 10
check_json "2_auto_selected.json" "删除标记"
check_video "3_output_cut.mp4" "剪辑成片"
check_file "3_review.html" "审核网页" 1000
check_json "3_delete_segments.json" "删除时间段"
check_json "3_feedback.json" "反馈文件"

echo ""
echo "Phase 1 附加: 字幕烧录"
check_video "3_output_subtitled.mp4" "带字幕视频"

echo ""
echo "Phase 2: 内容降维"
check_file "4_transcript.txt" "纯文字转录" 100
check_file "4_article_cn.md" "中文文章" 500
check_file "4_article_en.md" "英文文章" 500
check_file "4_podcast.mp3" "播客音频" 10000
check_json "4_quotes.json" "金句 JSON"
check_json "4_video_meta.json" "视频元数据"
check_file "4_thumbnail.png" "封面图" 10000

echo ""
echo "Phase 3+4: 平台内容 + 卡片"
check_file "5_jike_post.md" "即刻文案" 100
check_file "5_xhs_caption.md" "小红书文案" 100
check_file "5_wechat_article.md" "公众号文章" 200
check_json "5_x_thread.json" "X Thread"
check_file "5_x_post.md" "X Post" 50

# 金句卡片（至少 1 张）
if compgen -G "$DIR/4_card_*.png" > /dev/null 2>&1; then
  CARD_COUNT=$(compgen -G "$DIR/4_card_*.png" | wc -l | tr -d ' ')
  echo "  ✅ 金句卡片 (${CARD_COUNT} 张)"
  PASS=$((PASS + 1))
else
  echo "  ❌ 金句卡片 — 无卡片文件"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Phase 5: Manifest"
check_json "manifest.json" "Manifest"

# 验证 manifest 包含所有平台
if [[ -f "$DIR/manifest.json" ]]; then
  for platform in douyin jike xhs wechat x_post x_thread; do
    if node -e "const m=JSON.parse(require('fs').readFileSync('$DIR/manifest.json','utf8')); if(!m.platforms.$platform) process.exit(1)" 2>/dev/null; then
      echo "  ✅ manifest.$platform"
      PASS=$((PASS + 1))
    else
      echo "  ❌ manifest.$platform — 缺少平台"
      FAIL=$((FAIL + 1))
    fi
  done
fi

echo ""
echo "═══════════════════════════════════════"
echo "结果: ✅ $PASS 通过  ❌ $FAIL 失败"
echo "═══════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
