#!/usr/bin/env bash
# pipeline.sh — 一键内容生产 Pipeline
#
# 用法: ./pipeline.sh <video_file> [OPTIONS]
#   --skip-edit          跳过 Phase 1 视频剪辑
#   --output-dir <dir>   指定 output 目录（--skip-edit 时使用）
#   --publish            发布到各平台（Phase 7）
#
# 完整流程:
#   Phase 1: 视频剪辑 (run.sh)
#   Phase 2: 内容降维 (content-repurpose.sh)
#   Phase 3: 平台内容生成 (claude CLI)
#   Phase 4: 卡片生成 (generate-cards.sh，复用已有 4_thumbnail.png)
#   Phase 5: 生成 manifest.json
#   Phase 6: 打印 summary
#   Phase 7: 发布 (publish.sh，可选，需 --publish)

set -euo pipefail

# ─── 颜色 & 格式 ──────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
CYAN="\033[36m"
DIM="\033[2m"

log()  { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} $*"; }
info() { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} ${BLUE}ℹ${RESET}  $*"; }
ok()   { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} ${GREEN}✅${RESET} $*"; }
warn() { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} ${YELLOW}⚠️${RESET}  $*"; }
err()  { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} ${RED}❌${RESET} $*" >&2; }
phase(){ echo -e "\n${BOLD}${CYAN}═══ $* ═══${RESET}"; }
skip() { echo -e "${DIM}[$(date '+%H:%M:%S')]${RESET} ${YELLOW}⏭${RESET}  $* ${DIM}(已存在，跳过)${RESET}"; }

# ─── retry_claude: Claude CLI 调用 + 重试 ────────────────────────────────────
# 用法: echo "prompt" | retry_claude [claude_args...] > output.txt
#   - 最多重试 3 次，指数退避 (1s, 3s, 9s)
#   - 验证输出非空
retry_claude() {
  local max_retries=3
  local delay=1
  local attempt=1
  local tmp_out tmp_in
  tmp_out=$(mktemp)
  tmp_in=$(mktemp)
  cat > "$tmp_in"  # 缓存 stdin，重试时可重放

  while [[ $attempt -le $max_retries ]]; do
    if claude "$@" < "$tmp_in" > "$tmp_out" 2>/dev/null; then
      # 验证输出非空（去除空白后至少 10 字节）
      local size
      size=$(wc -c < "$tmp_out" | tr -d ' ')
      if [[ $size -ge 10 ]]; then
        cat "$tmp_out"
        rm -f "$tmp_out" "$tmp_in"
        return 0
      fi
      warn "Claude 输出为空 (attempt $attempt/$max_retries)"
    else
      warn "Claude CLI 失败 (attempt $attempt/$max_retries)"
    fi

    if [[ $attempt -lt $max_retries ]]; then
      info "等待 ${delay}s 后重试..."
      sleep $delay
      delay=$((delay * 3))
    fi
    attempt=$((attempt + 1))
  done

  # 最后一次失败，输出已有内容（可能为空）并返回错误
  cat "$tmp_out"
  rm -f "$tmp_out" "$tmp_in"
  err "Claude CLI 调用失败，已重试 $max_retries 次"
  return 1
}

PIPELINE_START=$(date +%s)

# ─── 脚本目录 & 路径 ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SH="$SCRIPT_DIR/run.sh"
REPURPOSE_SH="$SCRIPT_DIR/content-repurpose.sh"
CARDS_SH="$SCRIPT_DIR/generate-cards.sh"
PUBLISH_SH="$SCRIPT_DIR/publish.sh"

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
VIDEO_PATH=""
SKIP_EDIT=false
OUTPUT_DIR_OVERRIDE=""
DO_PUBLISH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-edit)
      SKIP_EDIT=true
      shift ;;
    --output-dir)
      OUTPUT_DIR_OVERRIDE="$2"
      shift 2 ;;
    --publish)
      DO_PUBLISH=true
      shift ;;
    -*)
      err "未知参数: $1"
      exit 1 ;;
    *)
      if [[ -z "$VIDEO_PATH" ]]; then
        VIDEO_PATH="$1"
      fi
      shift ;;
  esac
done

# 验证参数
if [[ -z "$VIDEO_PATH" && "$SKIP_EDIT" = false ]]; then
  err "缺少视频路径"
  echo "用法: $0 <video_file> [--skip-edit] [--output-dir <dir>]"
  exit 1
fi

if [[ -n "$VIDEO_PATH" && ! -f "$VIDEO_PATH" ]]; then
  err "找不到视频文件: $VIDEO_PATH"
  exit 1
fi

# 解析视频绝对路径
[[ -n "$VIDEO_PATH" ]] && VIDEO_PATH="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"

# 推断 output 目录
if [[ -n "$OUTPUT_DIR_OVERRIDE" ]]; then
  OUTPUT_DIR="$(cd "$OUTPUT_DIR_OVERRIDE" && pwd)"
elif [[ -n "$VIDEO_PATH" ]]; then
  VIDEO_BASENAME=$(basename "$VIDEO_PATH")
  DATE=$(date +%Y-%m-%d)
  OUTPUT_DIR="$SCRIPT_DIR/output/${DATE}_${VIDEO_BASENAME}"
else
  err "--skip-edit 时必须提供 --output-dir"
  exit 1
fi

echo ""
echo -e "${BOLD}${CYAN}🎬 Videocut Pipeline${RESET}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
[[ -n "$VIDEO_PATH" ]] && log "视频: $VIDEO_PATH"
log "输出: $OUTPUT_DIR"
log "跳过剪辑: $SKIP_EDIT"
echo ""

# ─── 文件大小辅助 ─────────────────────────────────────────────────────────────
file_size() {
  local f="$1"
  local size_bytes
  size_bytes=$(wc -c < "$f" 2>/dev/null | tr -d ' ') || echo "0"
  if [[ $size_bytes -gt 1048576 ]]; then
    printf "%.1fM" "$(echo "scale=1; $size_bytes / 1048576" | bc)"
  elif [[ $size_bytes -gt 1024 ]]; then
    printf "%.1fK" "$(echo "scale=1; $size_bytes / 1024" | bc)"
  else
    echo "${size_bytes}B"
  fi
}

print_file() {
  local LABEL="$1"
  local FPATH="$2"
  if [[ -f "$FPATH" ]]; then
    local SIZE
    SIZE=$(file_size "$FPATH")
    echo -e "  ${GREEN}✓${RESET} ${LABEL}  ${DIM}${SIZE}${RESET}"
  else
    echo -e "  ${RED}✗${RESET} ${LABEL}  ${DIM}(缺失)${RESET}"
  fi
}

# ─── 剥除 Claude 可能添加的 markdown 代码块围栏 ──────────────────────────────
strip_code_fences() {
  local FILE="$1"
  [[ -f "$FILE" ]] || return 0
  STRIP_TARGET="$FILE" node -e '
    const fs = require("fs");
    const f = process.env.STRIP_TARGET;
    let c = fs.readFileSync(f, "utf8");
    // Remove leading ```lang\n or ```\n
    c = c.replace(/^```[a-zA-Z]*\n/, "");
    // Remove trailing \n```\s*
    c = c.replace(/\n```\s*$/, "");
    c = c.trim();
    fs.writeFileSync(f, c + "\n");
  ' 2>/dev/null || true
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: 视频剪辑
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 1: 视频剪辑"

run_phase1() {
  if [[ "$SKIP_EDIT" = true ]]; then
    warn "Phase 1 已跳过（--skip-edit）"
    if [[ ! -d "$OUTPUT_DIR" ]]; then
      err "output 目录不存在: $OUTPUT_DIR"
      exit 1
    fi
    return
  fi

  # 断点续跑
  if [[ -f "$OUTPUT_DIR/1_volcengine_result.json" ]]; then
    skip "Phase 1 (1_volcengine_result.json 已存在)"
    return
  fi

  info "调用 run.sh..."
  bash "$RUN_SH" "$VIDEO_PATH" small --no-server
  ok "Phase 1 完成"
}

run_phase1

if [[ ! -f "$OUTPUT_DIR/1_volcengine_result.json" ]]; then
  err "Phase 1 输出缺失: $OUTPUT_DIR/1_volcengine_result.json"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2: 内容降维
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 2: 内容降维"

run_phase2() {
  if [[ -f "$OUTPUT_DIR/4_article_cn.md" && -f "$OUTPUT_DIR/4_article_en.md" ]]; then
    skip "Phase 2 (4_*.md 已存在)"
    return
  fi

  info "调用 content-repurpose.sh..."
  if [[ -n "$VIDEO_PATH" ]]; then
    bash "$REPURPOSE_SH" "$OUTPUT_DIR" "$VIDEO_PATH"
  else
    bash "$REPURPOSE_SH" "$OUTPUT_DIR"
  fi
  ok "Phase 2 完成"
}

run_phase2

for f in "$OUTPUT_DIR/4_article_cn.md" "$OUTPUT_DIR/4_article_en.md" "$OUTPUT_DIR/4_quotes.json"; do
  if [[ ! -f "$f" ]]; then
    err "Phase 2 输出缺失: $f"
    exit 1
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: 平台内容生成
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 3: 平台内容生成"

CN_CONTENT=$(cat "$OUTPUT_DIR/4_article_cn.md")
EN_CONTENT=$(cat "$OUTPUT_DIR/4_article_en.md")

# ── 3.1 即刻短版 ──────────────────────────────────────────────────────────────
gen_jike() {
  local OUT="$OUTPUT_DIR/5_jike_post.md"
  if [[ -f "$OUT" ]]; then skip "5_jike_post.md"; return; fi
  info "生成 5_jike_post.md (即刻短版 <1000字)..."

  printf '%s\n\n%s' \
    "你是即刻 App 的资深用户，擅长写简洁有力的长帖。

请将以下中文文章改写为即刻风格的短版内容。

要求：
- 字数严格少于 1000 字
- 不要 Markdown 标题（去掉所有 # 标题）
- 去掉所有 --- 分隔线
- 口语化表达，像在和朋友说话
- 保留核心观点和洞察
- 开头要有冲击力，直接抛出最有价值的观点
- 结尾可以提问或引发思考
- 纯文本输出，不要任何解释或前言

原文：" \
    "$CN_CONTENT" \
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
  ok "5_jike_post.md ($(file_size "$OUT"))"
}

# ── 3.2 小红书文案 ────────────────────────────────────────────────────────────
gen_xhs() {
  local OUT="$OUTPUT_DIR/5_xhs_caption.md"
  if [[ -f "$OUT" ]]; then skip "5_xhs_caption.md"; return; fi
  info "生成 5_xhs_caption.md (小红书 <500字)..."

  printf '%s\n\n%s' \
    "你是小红书运营专家，擅长写病毒式传播的小红书文案。

请将以下中文文章改写为小红书风格的文案。

要求：
- 字数严格少于 500 字（不含 emoji 和话题标签）
- 大量使用 emoji（每段都要有，但要自然不堆砌）
- 结尾加 5-8 个话题标签，格式：#话题名
- 开头有吸引力（可以用「说个扎心的真相」「对！就是这个！」等口语化开场）
- 分段清晰，每段 2-3 句
- 语气轻松活泼
- 纯文本输出，不要任何解释或前言

原文：" \
    "$CN_CONTENT" \
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
  ok "5_xhs_caption.md ($(file_size "$OUT"))"
}

# ── 3.3 公众号文章 ────────────────────────────────────────────────────────────
gen_wechat() {
  local OUT="$OUTPUT_DIR/5_wechat_article.md"
  if [[ -f "$OUT" ]]; then skip "5_wechat_article.md"; return; fi
  info "生成 5_wechat_article.md (公众号版)..."

  printf '%s\n\n%s' \
    "你是公众号运营专家，擅长写深度、有传播力的公众号文章。

请将以下中文文章改写为公众号版本。

要求：
- 保留原文核心内容和完整观点
- 在文章结尾自然地加上引导关注的话
  例如：「如果这篇文章对你有启发，点击右下角【在看】，让更多人看到。关注我，持续分享 AI 时代的洞察。」
- 保留 Markdown 格式（标题用 #，加粗等）
- 段落间距合理，适合手机阅读
- 语言流畅自然
- 纯 Markdown 输出，不要任何解释或前言

原文：" \
    "$CN_CONTENT" \
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
  ok "5_wechat_article.md ($(file_size "$OUT"))"
}

# ── 3.4 X Thread ──────────────────────────────────────────────────────────────
gen_x_thread() {
  local OUT="$OUTPUT_DIR/5_x_thread.json"
  if [[ -f "$OUT" ]]; then
    strip_code_fences "$OUT"  # 清理可能的围栏（无论新旧文件）
    skip "5_x_thread.json"
    return
  fi
  info "生成 5_x_thread.json (5-8条 Thread)..."

  printf '%s\n\n%s' \
    'You are an expert Twitter/X thread writer with a knack for viral content.

Convert the following English article into a compelling X (Twitter) thread.

Requirements:
- 5 to 8 tweets total
- First tweet: punchy hook — controversial or counterintuitive. Under 280 chars.
- Middle tweets: one key idea each. Under 280 chars each.
- Last tweet: CTA or thought-provoking closer
- Each tweet self-contained and punchy
- NO hashtags in individual tweets (2-3 only in last tweet if appropriate)
- NO emojis unless genuinely impactful
- NO "Thread", "1/", "/end" markers — just the content
- IMPORTANT: Output ONLY a raw JSON array. No markdown, no code fences, no explanation.
- Format: [{"tweet": "text", "position": 1}, ...]

Article:' \
    "$EN_CONTENT" \
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
  strip_code_fences "$OUT"
  ok "5_x_thread.json ($(file_size "$OUT"))"
}

# ── 3.5 X 单条 Hot Take ───────────────────────────────────────────────────────
gen_x_post() {
  local OUT="$OUTPUT_DIR/5_x_post.md"
  if [[ -f "$OUT" ]]; then skip "5_x_post.md"; return; fi
  info "生成 5_x_post.md (单条 hot take <280字)..."

  printf '%s\n\n%s' \
    'You are a master of viral one-tweet hot takes.

Write ONE single tweet based on the core idea of this article.

Requirements:
- Under 280 characters STRICTLY (count carefully)
- Hot take: bold, slightly controversial, or counterintuitive
- Native English voice
- No hashtags, no emojis, no attribution
- Output ONLY the tweet text, nothing else

Article:' \
    "$EN_CONTENT" \
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
  local CHAR_COUNT
  CHAR_COUNT=$(wc -m < "$OUT" | tr -d ' ')
  if [[ $CHAR_COUNT -gt 300 ]]; then
    warn "5_x_post.md 可能超过 280 字 (${CHAR_COUNT} chars)，请检查"
  fi
  ok "5_x_post.md (${CHAR_COUNT} chars)"
}

# ── 并行执行 5 个平台内容生成 ────────────────────────────────────────────────
info "并行生成 5 个平台内容..."

LOG_DIR=$(mktemp -d)
PIDS=()
NAMES=()

run_parallel() {
  local name="$1"
  local func="$2"
  local logfile="$LOG_DIR/${name}.log"
  (
    set +e
    $func > "$logfile" 2>&1
    echo $? > "$LOG_DIR/${name}.exit"
  ) &
  PIDS+=($!)
  NAMES+=("$name")
}

run_parallel "jike"      gen_jike
run_parallel "xhs"       gen_xhs
run_parallel "wechat"    gen_wechat
run_parallel "x_thread"  gen_x_thread
run_parallel "x_post"    gen_x_post

# 等待全部完成
FAILED=0
for i in "${!PIDS[@]}"; do
  wait "${PIDS[$i]}" 2>/dev/null
  EXIT_CODE=$(cat "$LOG_DIR/${NAMES[$i]}.exit" 2>/dev/null || echo "1")
  # 打印该任务的日志
  cat "$LOG_DIR/${NAMES[$i]}.log" 2>/dev/null
  if [[ "$EXIT_CODE" != "0" ]]; then
    err "${NAMES[$i]} 生成失败 (exit $EXIT_CODE)"
    FAILED=$((FAILED + 1))
  fi
done

rm -rf "$LOG_DIR"

if [[ $FAILED -gt 0 ]]; then
  warn "$FAILED 个平台内容生成失败，但继续执行"
fi

ok "Phase 3 完成 → $OUTPUT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 4: 卡片生成（复用已有 4_thumbnail.png）
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 4: 卡片生成"

run_phase4() {
  if compgen -G "$OUTPUT_DIR/4_card_*.png" > /dev/null 2>&1; then
    local CARD_COUNT
    CARD_COUNT=$(compgen -G "$OUTPUT_DIR/4_card_*.png" | wc -l | tr -d ' ')
    skip "Phase 4 (4_card_*.png 已有 ${CARD_COUNT} 张)"
    return
  fi

  info "调用 generate-cards.sh..."
  bash "$CARDS_SH" "$OUTPUT_DIR/4_quotes.json"
  ok "Phase 4 完成"
}

run_phase4

if [[ -f "$OUTPUT_DIR/4_thumbnail.png" ]]; then
  ok "Thumbnail: $OUTPUT_DIR/4_thumbnail.png (复用)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 5: 生成 manifest.json
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 5: 生成 manifest.json"

gen_manifest() {
  local MANIFEST="$OUTPUT_DIR/manifest.json"

  if [[ -f "$MANIFEST" ]]; then
    skip "manifest.json"
    return
  fi

  info "生成 manifest.json..."

  local CARDS_JSON="[]"
  CARDS_JSON=$(OUTPUT_DIR="$OUTPUT_DIR" node -e '
    const fs = require("fs");
    const dir = process.env.OUTPUT_DIR;
    try {
      const files = fs.readdirSync(dir)
        .filter(f => /^4_card_\d+\.png$/.test(f))
        .sort()
        .map(f => dir + "/" + f);
      process.stdout.write(JSON.stringify(files));
    } catch(e) { process.stdout.write("[]"); }
  ' 2>/dev/null || echo "[]")

  local THREAD_COUNT=0
  if [[ -f "$OUTPUT_DIR/5_x_thread.json" ]]; then
    THREAD_COUNT=$(THREAD_FILE="$OUTPUT_DIR/5_x_thread.json" node -e '
      try {
        const d = JSON.parse(require("fs").readFileSync(process.env.THREAD_FILE, "utf8"));
        process.stdout.write(String(Array.isArray(d) ? d.length : 0));
      } catch(e) { process.stdout.write("0"); }
    ' 2>/dev/null || echo "0")
  fi

  OUTPUT_DIR="$OUTPUT_DIR" \
  CARDS_JSON="$CARDS_JSON" \
  THREAD_COUNT="$THREAD_COUNT" \
  node -e '
    const fs   = require("fs");
    const path = require("path");
    const outputDir   = process.env.OUTPUT_DIR;
    const cardsJson   = JSON.parse(process.env.CARDS_JSON || "[]");
    const threadCount = parseInt(process.env.THREAD_COUNT) || 0;

    function fi(p) {
      if (!p || !fs.existsSync(p)) return null;
      return { path: p, size_bytes: fs.statSync(p).size };
    }

    const manifest = {
      generated_at: new Date().toISOString(),
      output_dir: outputDir,
      video: {
        thumbnail: fi(path.join(outputDir, "4_thumbnail.png")),
        status: "ready"
      },
      content: {
        transcript:  fi(path.join(outputDir, "4_transcript.txt")),
        article_cn:  fi(path.join(outputDir, "4_article_cn.md")),
        article_en:  fi(path.join(outputDir, "4_article_en.md")),
        video_meta:  fi(path.join(outputDir, "4_video_meta.json")),
        quotes:      fi(path.join(outputDir, "4_quotes.json")),
        podcast:     fi(path.join(outputDir, "4_podcast.mp3"))
      },
      platforms: {
        douyin: {
          video: fi(path.join(outputDir, "3_output_cut.mp4")),
          meta:  fi(path.join(outputDir, "4_video_meta.json")),
          status: "pending"
        },
        jike: {
          text:   fi(path.join(outputDir, "5_jike_post.md")),
          status: "pending"
        },
        xhs: {
          text:   fi(path.join(outputDir, "5_xhs_caption.md")),
          images: cardsJson.map(p => fi(p)).filter(Boolean),
          status: "pending"
        },
        wechat: {
          text:   fi(path.join(outputDir, "5_wechat_article.md")),
          cover:  fi(path.join(outputDir, "4_thumbnail.png")),
          status: "pending"
        },
        x_post: {
          text:   fi(path.join(outputDir, "5_x_post.md")),
          image:  fi(path.join(outputDir, "4_thumbnail.png")),
          status: "pending"
        },
        x_thread: {
          text:        fi(path.join(outputDir, "5_x_thread.json")),
          tweet_count: threadCount,
          status:      "pending"
        },
        youtube: {
          meta:      fi(path.join(outputDir, "4_video_meta.json")),
          thumbnail: fi(path.join(outputDir, "4_thumbnail.png")),
          status:    "pending"
        },
        bilibili: {
          meta:      fi(path.join(outputDir, "4_video_meta.json")),
          thumbnail: fi(path.join(outputDir, "4_thumbnail.png")),
          status:    "pending"
        },
        podcast: {
          audio:  fi(path.join(outputDir, "4_podcast.mp3")),
          meta:   fi(path.join(outputDir, "4_video_meta.json")),
          status: "pending"
        }
      }
    };

    fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log("manifest.json written ✓");
  '

  ok "manifest.json → $OUTPUT_DIR/manifest.json"
}

gen_manifest

# ─────────────────────────────────────────────────────────────────────────────
# Phase 6: Summary
# ─────────────────────────────────────────────────────────────────────────────
phase "Phase 6: Summary"

PIPELINE_END=$(date +%s)
ELAPSED=$((PIPELINE_END - PIPELINE_START))
ELAPSED_FMT=$(printf '%dm%ds' $((ELAPSED/60)) $((ELAPSED%60)))

echo ""
echo -e "${BOLD}${GREEN}🎉 Pipeline 完成！${RESET}  ${DIM}耗时: ${ELAPSED_FMT}${RESET}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

echo -e "${BOLD}📦 内容降维 (4_*)${RESET}"
print_file "4_article_cn.md"   "$OUTPUT_DIR/4_article_cn.md"
print_file "4_article_en.md"   "$OUTPUT_DIR/4_article_en.md"
print_file "4_podcast.mp3"     "$OUTPUT_DIR/4_podcast.mp3"
print_file "4_quotes.json"     "$OUTPUT_DIR/4_quotes.json"
print_file "4_video_meta.json" "$OUTPUT_DIR/4_video_meta.json"
print_file "4_thumbnail.png"   "$OUTPUT_DIR/4_thumbnail.png"

if compgen -G "$OUTPUT_DIR/4_card_*.png" > /dev/null 2>&1; then
  CARD_COUNT=$(compgen -G "$OUTPUT_DIR/4_card_*.png" | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET} 4_card_*.png  ${DIM}${CARD_COUNT} 张${RESET}"
fi

echo ""
echo -e "${BOLD}📱 平台内容 (5_*)${RESET}"
print_file "5_jike_post.md"      "$OUTPUT_DIR/5_jike_post.md"
print_file "5_xhs_caption.md"    "$OUTPUT_DIR/5_xhs_caption.md"
print_file "5_wechat_article.md" "$OUTPUT_DIR/5_wechat_article.md"
print_file "5_x_thread.json"     "$OUTPUT_DIR/5_x_thread.json"
print_file "5_x_post.md"         "$OUTPUT_DIR/5_x_post.md"

echo ""
echo -e "${BOLD}📋 Manifest${RESET}"
print_file "manifest.json" "$OUTPUT_DIR/manifest.json"

echo ""
echo -e "${DIM}输出目录: $OUTPUT_DIR${RESET}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Phase 7: 发布 (可选)
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$DO_PUBLISH" = true ]]; then
  phase "Phase 7: 发布"
  bash "$PUBLISH_SH" "$OUTPUT_DIR"
fi
