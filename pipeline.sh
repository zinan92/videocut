#!/usr/bin/env bash
#
# pipeline.sh — 内容生产 Master Pipeline
#
# 用法:
#   ./pipeline.sh <video.mp4>
#   ./pipeline.sh <video.mp4> --skip-edit
#   ./pipeline.sh <video.mp4> --skip-edit --output-dir output/2026-02-26_xxx/
#
# 阶段:
#   Phase 1: 视频粗剪 (run.sh)
#   Phase 2: 内容降维 (content-repurpose.sh)
#   Phase 3: 平台特定内容生成 (claude CLI)
#   Phase 4: 视觉卡片生成 (generate-cards.sh)
#   Phase 5: 生成 manifest.json
#   Phase 6: 产出总结

set -e

# ─── 颜色 & 工具 ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ts() { date '+%H:%M:%S'; }
log()     { echo -e "${CYAN}[$(ts)]${RESET} $*"; }
log_ok()  { echo -e "${GREEN}[$(ts)] ✅${RESET} $*"; }
log_skip(){ echo -e "${YELLOW}[$(ts)] ⏭️  SKIP${RESET} $*"; }
log_err() { echo -e "${RED}[$(ts)] ❌${RESET} $*" >&2; }
phase()   { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════${RESET}"; \
            echo -e "${BOLD}${BLUE}  $*${RESET}"; \
            echo -e "${BOLD}${BLUE}══════════════════════════════════════${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
VIDEO_PATH=""
SKIP_EDIT=false
OUTPUT_DIR_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-edit)
      SKIP_EDIT=true
      shift
      ;;
    --output-dir)
      OUTPUT_DIR_OVERRIDE="$2"
      shift 2
      ;;
    --output-dir=*)
      OUTPUT_DIR_OVERRIDE="${1#--output-dir=}"
      shift
      ;;
    -*)
      log_err "未知选项: $1"
      exit 1
      ;;
    *)
      if [[ -z "$VIDEO_PATH" ]]; then
        VIDEO_PATH="$1"
      fi
      shift
      ;;
  esac
done

# 校验
if [[ -z "$VIDEO_PATH" && -z "$OUTPUT_DIR_OVERRIDE" ]]; then
  echo "用法: $0 <video.mp4> [--skip-edit] [--output-dir <dir>]"
  echo ""
  echo "  --skip-edit          跳过 Phase 1 (视频粗剪)"
  echo "  --output-dir <dir>   指定/复用已有输出目录"
  echo ""
  echo "示例:"
  echo "  $0 video.mp4"
  echo "  $0 video.mp4 --skip-edit --output-dir output/2026-02-26_video/"
  exit 1
fi

PIPELINE_START=$(date +%s)

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     🎬 Content Pipeline v1.0             ║"
echo "  ║     Master Production Pipeline           ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

# ─── Phase 1: 视频粗剪 ───────────────────────────────────────────────────────
phase "Phase 1: 视频粗剪 (run.sh)"

phase1_main() {
  if [[ "$SKIP_EDIT" == "true" ]]; then
    log_skip "Phase 1 — --skip-edit 模式，跳过视频粗剪"
    return 0
  fi

  if [[ -z "$VIDEO_PATH" ]]; then
    log_err "Phase 1 需要视频路径，请提供 <video.mp4> 或使用 --skip-edit"
    exit 1
  fi

  if [[ ! -f "$VIDEO_PATH" ]]; then
    log_err "找不到视频文件: $VIDEO_PATH"
    exit 1
  fi

  VIDEO_ABS="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"
  log "运行 run.sh: $VIDEO_ABS"
  cd "$SCRIPT_DIR"
  ./run.sh "$VIDEO_ABS" small --no-server
  log_ok "Phase 1 完成"
}

phase1_main

# ─── 确定 OUTPUT_DIR ─────────────────────────────────────────────────────────
if [[ -n "$OUTPUT_DIR_OVERRIDE" ]]; then
  # 用指定目录（绝对或相对 SCRIPT_DIR）
  if [[ "$OUTPUT_DIR_OVERRIDE" = /* ]]; then
    OUTPUT_DIR="$OUTPUT_DIR_OVERRIDE"
  else
    OUTPUT_DIR="$SCRIPT_DIR/$OUTPUT_DIR_OVERRIDE"
  fi
  if [[ ! -d "$OUTPUT_DIR" ]]; then
    log_err "指定的 --output-dir 不存在: $OUTPUT_DIR"
    exit 1
  fi
else
  # 从视频名推断 run.sh 的输出目录
  VIDEO_ABS="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"
  VIDEO_BASE=$(basename "$VIDEO_PATH")
  VIDEO_STEM="${VIDEO_BASE%.*}"
  DATE_PREFIX=$(date +%Y-%m-%d)
  OUTPUT_DIR="$SCRIPT_DIR/output/${DATE_PREFIX}_${VIDEO_STEM}"
  if [[ ! -d "$OUTPUT_DIR" ]]; then
    log_err "推断的输出目录不存在: $OUTPUT_DIR"
    log_err "请使用 --output-dir 指定正确路径"
    exit 1
  fi
fi

log "📂 输出目录: $OUTPUT_DIR"

# ─── Phase 2: 内容降维 ───────────────────────────────────────────────────────
phase "Phase 2: 内容降维 (content-repurpose.sh)"

phase2_main() {
  REPURPOSE_DIR="$OUTPUT_DIR/4_内容降维"
  # 检查所有关键输出是否存在
  ALL_EXIST=true
  for f in article_cn.md article_en.md quotes.json video_meta.json; do
    if [[ ! -f "$REPURPOSE_DIR/$f" ]]; then
      ALL_EXIST=false
      break
    fi
  done

  if [[ "$ALL_EXIST" == "true" ]]; then
    log_skip "4_内容降维/ 输出已存在，跳过 Phase 2"
    return 0
  fi

  if [[ -z "$VIDEO_PATH" ]]; then
    log "运行 content-repurpose.sh (无视频路径)"
    cd "$SCRIPT_DIR"
    ./content-repurpose.sh "$OUTPUT_DIR"
  else
    VIDEO_ABS="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"
    log "运行 content-repurpose.sh"
    cd "$SCRIPT_DIR"
    ./content-repurpose.sh "$OUTPUT_DIR" "$VIDEO_ABS"
  fi
  log_ok "Phase 2 完成"
}

phase2_main

# ─── 读取文章内容 ─────────────────────────────────────────────────────────────
ARTICLE_CN="$OUTPUT_DIR/4_内容降维/article_cn.md"
ARTICLE_EN="$OUTPUT_DIR/4_内容降维/article_en.md"

if [[ ! -f "$ARTICLE_CN" ]]; then
  log_err "找不到 article_cn.md: $ARTICLE_CN"
  exit 1
fi
if [[ ! -f "$ARTICLE_EN" ]]; then
  log_err "找不到 article_en.md: $ARTICLE_EN"
  exit 1
fi

ARTICLE_CN_CONTENT=$(cat "$ARTICLE_CN")
ARTICLE_EN_CONTENT=$(cat "$ARTICLE_EN")

# ─── Phase 3: 平台特定内容 ───────────────────────────────────────────────────
phase "Phase 3: 平台特定内容 (Claude CLI)"

PLATFORM_DIR="$OUTPUT_DIR/5_平台内容"
mkdir -p "$PLATFORM_DIR"

# 辅助：调用 claude -p 生成内容，失败不终止整体流程
claude_generate() {
  local PROMPT="$1"
  local OUT_FILE="$2"
  local LABEL="$3"

  if [[ -f "$OUT_FILE" && -s "$OUT_FILE" ]]; then
    log_skip "$LABEL (文件已存在)"
    return 0
  fi

  log "生成 $LABEL ..."
  local RESULT
  if RESULT=$(echo "$PROMPT" | claude -p --output-format text --dangerously-skip-permissions 2>&1); then
    echo "$RESULT" > "$OUT_FILE"
    local SIZE
    SIZE=$(wc -c < "$OUT_FILE" | tr -d ' ')
    log_ok "$LABEL → $(basename "$OUT_FILE") (${SIZE} bytes)"
  else
    log_err "$LABEL 生成失败: $RESULT"
    # 不 exit，继续其他平台
    return 1
  fi
}

# ── 即刻短版 ──────────────────────────────────────────────────────────────────
phase3_jike() {
  local PROMPT="你是即刻平台的内容创作者，风格简洁有力、口语化、有个人观点。

请将以下中文文章改写为即刻短版动态：

要求：
- 字数 1000 字以内
- 去掉所有标题（# ## 等）和分隔线（---）
- 口语化，像在和朋友聊天
- 保留核心观点，去掉冗余解释
- 结尾可以有一个开放性问题或行动号召
- 直接输出正文，不要任何解释或元信息

原文章：

${ARTICLE_CN_CONTENT}"

  claude_generate "$PROMPT" "$PLATFORM_DIR/jike_post.md" "即刻短版"
}

# ── 小红书文案 ────────────────────────────────────────────────────────────────
phase3_xhs() {
  local PROMPT="你是小红书头部创作者，擅长写病毒式传播的图文笔记。

请将以下中文文章改写为小红书文案：

要求：
- 500 字以内
- 开头要有强力 hook（前两行决定用户是否继续读）
- 全文加入恰当的 emoji，增加视觉节奏感
- 结尾必须有 3-8 个相关话题标签（格式：#AI #未来 #职场 等）
- 语气活泼、有温度，像真人分享
- 直接输出文案正文，不要任何解释

原文章：

${ARTICLE_CN_CONTENT}"

  claude_generate "$PROMPT" "$PLATFORM_DIR/xhs_caption.md" "小红书文案"
}

# ── 公众号版 ──────────────────────────────────────────────────────────────────
phase3_wechat() {
  local PROMPT="你是微信公众号编辑，负责对原文进行最终排版和发布优化。

请将以下中文文章改写为公众号版本：

要求：
- 基本保留原文内容和结构，不做大幅改动
- 在文章末尾加上「关注引导」段落（内容：如果这篇文章对你有启发，欢迎关注，我们一起在 AI 时代找到自己的位置。）
- 用 Markdown 格式输出
- 直接输出文章全文，不要任何解释

原文章：

${ARTICLE_CN_CONTENT}"

  claude_generate "$PROMPT" "$PLATFORM_DIR/wechat_article.md" "公众号版"
}

# ── X Thread ─────────────────────────────────────────────────────────────────
phase3_x_thread() {
  local PROMPT="You are a viral X (Twitter) content creator known for insightful threads.

Please rewrite the following English article as an X thread:

Requirements:
- 5 to 8 tweets
- Each tweet must be under 280 characters
- First tweet must be a high-impact hook that makes people want to read more
- Last tweet should be a strong takeaway or call to action
- Natural thread flow, each tweet should stand alone yet connect to the whole
- Output ONLY a valid JSON array with no markdown code blocks, no explanation
- Format: [{\"tweet\": \"...\", \"position\": 1}, {\"tweet\": \"...\", \"position\": 2}, ...]

Article:

${ARTICLE_EN_CONTENT}"

  claude_generate "$PROMPT" "$PLATFORM_DIR/x_thread.json" "X Thread"
}

# ── X 单条 hot take ───────────────────────────────────────────────────────────
phase3_x_post() {
  local PROMPT="You are a thought leader on X (Twitter) with a talent for hot takes.

Please distill the following English article into a single, punchy X post:

Requirements:
- Under 280 characters
- High-conviction, specific insight — not generic advice
- Should make people stop scrolling
- Can include a provocative question, a counterintuitive take, or a striking stat
- Output ONLY the tweet text, nothing else

Article:

${ARTICLE_EN_CONTENT}"

  claude_generate "$PROMPT" "$PLATFORM_DIR/x_post.md" "X 单条"
}

# 并行不行（bash 子进程 + set -e 有坑），顺序执行但捕获单个错误
phase3_jike     || true
phase3_xhs      || true
phase3_wechat   || true
phase3_x_thread || true
phase3_x_post   || true

log_ok "Phase 3 完成"

# ─── Phase 4: 视觉卡片 ───────────────────────────────────────────────────────
phase "Phase 4: 视觉卡片 (generate-cards.sh)"

phase4_main() {
  QUOTES_JSON="$OUTPUT_DIR/4_内容降维/quotes.json"
  CARDS_DIR="$OUTPUT_DIR/4_内容降维/cards"

  if [[ ! -f "$QUOTES_JSON" ]]; then
    log_err "找不到 quotes.json: $QUOTES_JSON，跳过 Phase 4"
    return 1
  fi

  # 检查是否已有卡片
  CARD_COUNT=$(ls "$CARDS_DIR"/card_*.png 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CARD_COUNT" -gt 0 ]]; then
    log_skip "卡片已存在 ($CARD_COUNT 张)，跳过 Phase 4"
    return 0
  fi

  log "运行 generate-cards.sh ..."
  cd "$SCRIPT_DIR"
  ./generate-cards.sh "$QUOTES_JSON"
  log_ok "Phase 4 完成"
}

phase4_main || log_err "Phase 4 失败（非致命），继续..."

# ─── Phase 5: 生成 manifest.json ─────────────────────────────────────────────
phase "Phase 5: 生成 manifest.json"

phase5_main() {
  MANIFEST="$OUTPUT_DIR/manifest.json"

  if [[ -f "$MANIFEST" ]]; then
    log_skip "manifest.json 已存在，重新生成..."
  fi

  # 收集文件路径（相对于 OUTPUT_DIR）
  rel() {
    local F="$1"
    if [[ -f "$F" ]]; then
      # 输出相对 OUTPUT_DIR 的路径
      realpath --relative-to="$OUTPUT_DIR" "$F" 2>/dev/null || python3 -c "
import os, sys
f, base = sys.argv[1], sys.argv[2]
print(os.path.relpath(f, base))
" "$F" "$OUTPUT_DIR"
    else
      echo "null"
    fi
  }

  # 视频文件
  VIDEO_MASTER="null"
  if [[ -n "$VIDEO_PATH" && -f "$VIDEO_PATH" ]]; then
    VIDEO_MASTER="\"$(realpath "$VIDEO_PATH" 2>/dev/null || echo "$VIDEO_PATH")\""
  fi

  # 各 Phase 输出
  THUMBNAIL=$(rel "$OUTPUT_DIR/4_内容降维/thumbnail.png")
  PODCAST=$(rel "$OUTPUT_DIR/4_内容降维/podcast.mp3")
  ARTICLE_CN_REL=$(rel "$OUTPUT_DIR/4_内容降维/article_cn.md")
  VIDEO_META_REL=$(rel "$OUTPUT_DIR/4_内容降维/video_meta.json")

  X_POST=$(rel "$PLATFORM_DIR/x_post.md")
  X_THREAD=$(rel "$PLATFORM_DIR/x_thread.json")
  WECHAT=$(rel "$PLATFORM_DIR/wechat_article.md")
  JIKE=$(rel "$PLATFORM_DIR/jike_post.md")
  XHS=$(rel "$PLATFORM_DIR/xhs_caption.md")

  # 卡片列表
  CARD_FILES=()
  while IFS= read -r f; do
    CARD_FILES+=("\"$(rel "$f")\"")
  done < <(ls "$OUTPUT_DIR/4_内容降维/cards"/card_*.png 2>/dev/null | sort)
  CARDS_JSON="[$(IFS=,; echo "${CARD_FILES[*]}")]"
  if [[ ${#CARD_FILES[@]} -eq 0 ]]; then
    CARDS_JSON="[]"
  fi

  to_json_val() {
    local v="$1"
    if [[ "$v" == "null" ]]; then
      echo "null"
    else
      echo "\"$v\""
    fi
  }

  THUMBNAIL_JSON=$(to_json_val "$THUMBNAIL")
  PODCAST_JSON=$(to_json_val "$PODCAST")
  ARTICLE_CN_JSON=$(to_json_val "$ARTICLE_CN_REL")
  VIDEO_META_JSON_VAL=$(to_json_val "$VIDEO_META_REL")
  X_POST_JSON=$(to_json_val "$X_POST")
  X_THREAD_JSON=$(to_json_val "$X_THREAD")
  WECHAT_JSON=$(to_json_val "$WECHAT")
  JIKE_JSON=$(to_json_val "$JIKE")
  XHS_JSON=$(to_json_val "$XHS")

  GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  cat > "$MANIFEST" <<MANIFEST_EOF
{
  "generated_at": "${GENERATED_AT}",
  "output_dir": "${OUTPUT_DIR}",
  "video": {
    "master": ${VIDEO_MASTER},
    "thumbnail": ${THUMBNAIL_JSON},
    "meta": ${VIDEO_META_JSON_VAL}
  },
  "platforms": {
    "x_post": {
      "text": ${X_POST_JSON},
      "image": ${THUMBNAIL_JSON},
      "status": "pending"
    },
    "x_thread": {
      "text": ${X_THREAD_JSON},
      "status": "pending"
    },
    "x_article": {
      "text": ${ARTICLE_CN_JSON},
      "cover": ${THUMBNAIL_JSON},
      "status": "pending"
    },
    "wechat": {
      "html": ${WECHAT_JSON},
      "cover": ${THUMBNAIL_JSON},
      "status": "pending"
    },
    "jike": {
      "text": ${JIKE_JSON},
      "status": "pending"
    },
    "xhs": {
      "text": ${XHS_JSON},
      "images": ${CARDS_JSON},
      "status": "pending"
    },
    "youtube": {
      "video": ${VIDEO_MASTER},
      "meta": ${VIDEO_META_JSON_VAL},
      "status": "pending"
    },
    "bilibili": {
      "video": ${VIDEO_MASTER},
      "meta": ${VIDEO_META_JSON_VAL},
      "status": "pending"
    },
    "podcast": {
      "audio": ${PODCAST_JSON},
      "meta": ${VIDEO_META_JSON_VAL},
      "status": "pending"
    }
  }
}
MANIFEST_EOF

  log_ok "manifest.json 生成完成"
}

phase5_main

# ─── Phase 6: 产出总结 ───────────────────────────────────────────────────────
phase "Phase 6: 产出总结"

phase6_main() {
  PIPELINE_END=$(date +%s)
  ELAPSED=$((PIPELINE_END - PIPELINE_START))
  MINUTES=$((ELAPSED / 60))
  SECONDS=$((ELAPSED % 60))

  echo ""
  echo -e "${BOLD}${GREEN}🎉 Pipeline 完成！ (耗时 ${MINUTES}m ${SECONDS}s)${RESET}"
  echo -e "${BOLD}📂 输出目录: ${OUTPUT_DIR}${RESET}"
  echo ""
  echo -e "${BOLD}${CYAN}── 内容降维 ────────────────────────────────${RESET}"

  print_file() {
    local LABEL="$1"
    local FILE="$2"
    if [[ -f "$FILE" ]]; then
      local SIZE
      SIZE=$(ls -lh "$FILE" | awk '{print $5}')
      echo -e "  ${GREEN}✅${RESET} ${LABEL} ${CYAN}(${SIZE})${RESET}"
    else
      echo -e "  ${RED}❌${RESET} ${LABEL} ${RED}(缺失)${RESET}"
    fi
  }

  print_file "article_cn.md    " "$OUTPUT_DIR/4_内容降维/article_cn.md"
  print_file "article_en.md    " "$OUTPUT_DIR/4_内容降维/article_en.md"
  print_file "podcast.mp3      " "$OUTPUT_DIR/4_内容降维/podcast.mp3"
  print_file "quotes.json      " "$OUTPUT_DIR/4_内容降维/quotes.json"
  print_file "video_meta.json  " "$OUTPUT_DIR/4_内容降维/video_meta.json"
  print_file "thumbnail.png    " "$OUTPUT_DIR/4_内容降维/thumbnail.png"

  # 卡片
  CARD_COUNT=$(ls "$OUTPUT_DIR/4_内容降维/cards"/card_*.png 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CARD_COUNT" -gt 0 ]]; then
    echo -e "  ${GREEN}✅${RESET} cards/           ${CYAN}(${CARD_COUNT} 张)${RESET}"
  else
    echo -e "  ${RED}❌${RESET} cards/           ${RED}(缺失)${RESET}"
  fi

  echo ""
  echo -e "${BOLD}${CYAN}── 平台内容 ────────────────────────────────${RESET}"
  print_file "jike_post.md     " "$PLATFORM_DIR/jike_post.md"
  print_file "xhs_caption.md   " "$PLATFORM_DIR/xhs_caption.md"
  print_file "wechat_article.md" "$PLATFORM_DIR/wechat_article.md"
  print_file "x_thread.json    " "$PLATFORM_DIR/x_thread.json"
  print_file "x_post.md        " "$PLATFORM_DIR/x_post.md"

  echo ""
  echo -e "${BOLD}${CYAN}── 索引 ────────────────────────────────────${RESET}"
  print_file "manifest.json    " "$OUTPUT_DIR/manifest.json"

  echo ""
  echo -e "${BOLD}${YELLOW}下一步: 审核内容 → 发布到各平台${RESET}"
  echo ""
}

phase6_main
