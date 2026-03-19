#!/usr/bin/env bash
# publish.sh — 半自动内容发布
#
# 用法: ./publish.sh <output_dir> [--platform <name>]
#   output_dir: videocut 输出目录（如 ./output/2026-03-18_video/）
#   --platform: 只发布指定平台 (douyin|xhs|wechat|x)
#
# 依赖: pbcopy, open (macOS 自带)
# 可选: bird CLI (解锁 X 自动发布)

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

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
OUTPUT_DIR=""
PLATFORM_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM_FILTER="$2"
      shift 2 ;;
    -*)
      err "未知参数: $1"
      echo "用法: $0 <output_dir> [--platform douyin|xhs|wechat|x]"
      exit 1 ;;
    *)
      if [[ -z "$OUTPUT_DIR" ]]; then
        OUTPUT_DIR="$1"
      fi
      shift ;;
  esac
done

if [[ -z "$OUTPUT_DIR" ]]; then
  err "缺少输出目录"
  echo "用法: $0 <output_dir> [--platform douyin|xhs|wechat|x]"
  exit 1
fi

if [[ ! -d "$OUTPUT_DIR" ]]; then
  err "目录不存在: $OUTPUT_DIR"
  exit 1
fi

OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

# ─── 辅助函数 ─────────────────────────────────────────────────────────────────

# 读取 JSON 字段 (用 node 避免 jq 依赖)
json_get() {
  local file="$1"
  local expr="$2"
  JSON_FILE="$file" node -e "
    const d = JSON.parse(require('fs').readFileSync(process.env.JSON_FILE, 'utf8'));
    const r = ${expr};
    if (r !== undefined && r !== null) process.stdout.write(String(r));
  " 2>/dev/null || true
}

# 复制到剪贴板
clip() {
  local content="$1"
  local label="$2"
  printf '%s' "$content" | pbcopy
  ok "${label} 已复制到剪贴板"
}

# 等待用户确认
wait_user() {
  local prompt="${1:-按 Enter 继续 / 输入 s 跳过}"
  echo ""
  echo -e "  ${DIM}${prompt}${RESET}"
  read -r response
  if [[ "$response" == "s" || "$response" == "S" ]]; then
    return 1
  fi
  return 0
}

# 更新 manifest.json 中的平台状态
update_manifest() {
  local platform="$1"
  local status="$2"
  local manifest="$OUTPUT_DIR/manifest.json"
  [[ -f "$manifest" ]] || return 0

  MANIFEST_FILE="$manifest" \
  PLATFORM="$platform" \
  STATUS="$status" \
  node -e '
    const fs = require("fs");
    const f = process.env.MANIFEST_FILE;
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    if (d.platforms && d.platforms[process.env.PLATFORM]) {
      d.platforms[process.env.PLATFORM].status = process.env.STATUS;
      if (process.env.STATUS === "published") {
        d.platforms[process.env.PLATFORM].published_at = new Date().toISOString();
      }
    }
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
  ' 2>/dev/null || true
}

# 检查是否需要发布该平台
should_publish() {
  local platform="$1"
  if [[ -n "$PLATFORM_FILTER" && "$PLATFORM_FILTER" != "$platform" ]]; then
    return 1
  fi
  return 0
}

# 打印平台头部
platform_header() {
  local name="$1"
  local index="$2"
  local total="$3"
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║  📱 ${name} (${index}/${total})${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}"
}

echo ""
echo -e "${BOLD}${CYAN}📤 Videocut — 内容发布${RESET}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
log "输出目录: $OUTPUT_DIR"
echo ""

# ─── 平台 1: 抖音 ─────────────────────────────────────────────────────────────
publish_douyin() {
  should_publish "douyin" || return 0

  local meta="$OUTPUT_DIR/4_video_meta.json"
  # 优先使用带字幕版本
  local video="$OUTPUT_DIR/3_output_subtitled.mp4"
  [[ -f "$video" ]] || video="$OUTPUT_DIR/3_output_cut.mp4"

  if [[ ! -f "$meta" ]]; then
    warn "抖音: 缺少 4_video_meta.json，跳过"
    return 0
  fi

  platform_header "抖音" 1 4

  local title
  title=$(json_get "$meta" 'd.title_cn')
  local hook
  hook=$(json_get "$meta" 'd.hook && d.hook.cn')
  local tags
  tags=$(json_get "$meta" '(d.tags_cn || []).slice(0, 8).join(" ")')

  echo -e "  ${BOLD}标题:${RESET} $title"
  echo -e "  ${BOLD}Hook:${RESET} $hook"
  echo -e "  ${BOLD}标签:${RESET} $tags"
  if [[ -f "$video" ]]; then
    echo -e "  ${BOLD}视频:${RESET} $video"
  else
    warn "视频文件不存在: $video"
  fi

  # 复制标题到剪贴板
  clip "$title" "标题"

  # 打开抖音创作者中心
  open "https://creator.douyin.com/creator-micro/content/upload"
  info "已打开抖音创作者中心"

  echo ""
  echo -e "  ${BOLD}操作步骤:${RESET}"
  echo -e "  1. 上传视频文件"
  echo -e "  2. 粘贴标题 (已在剪贴板)"
  echo -e "  3. 添加标签: $tags"
  echo -e "  4. 发布"

  if wait_user; then
    update_manifest "douyin" "published"
    ok "抖音 → published"
  else
    update_manifest "douyin" "skipped"
    warn "抖音 → skipped"
  fi
}

# ─── 平台 2: 小红书 ───────────────────────────────────────────────────────────
publish_xhs() {
  should_publish "xhs" || return 0

  local caption="$OUTPUT_DIR/5_xhs_caption.md"
  local meta="$OUTPUT_DIR/4_video_meta.json"

  if [[ ! -f "$caption" ]]; then
    warn "小红书: 缺少 5_xhs_caption.md，跳过"
    return 0
  fi

  platform_header "小红书" 2 4

  local title
  title=$(json_get "$meta" 'd.title_cn')
  local content
  content=$(cat "$caption")

  echo -e "  ${BOLD}标题:${RESET} $title"
  echo -e "  ${BOLD}文案预览:${RESET}"
  echo "$content" | head -5 | sed 's/^/    /'
  echo -e "    ${DIM}...${RESET}"

  # 列出可用的卡片图
  local cards
  cards=$(compgen -G "$OUTPUT_DIR/4_card_*.png" 2>/dev/null | sort || true)
  if [[ -n "$cards" ]]; then
    local card_count
    card_count=$(echo "$cards" | wc -l | tr -d ' ')
    echo -e "  ${BOLD}卡片图:${RESET} ${card_count} 张"
    echo "$cards" | sed 's/^/    /'
  fi

  # 复制文案到剪贴板
  clip "$content" "小红书文案"

  # 打开小红书创作者中心
  open "https://creator.xiaohongshu.com/publish/publish"
  info "已打开小红书创作者中心"

  echo ""
  echo -e "  ${BOLD}操作步骤:${RESET}"
  echo -e "  1. 上传卡片图 (路径已打印在上方)"
  echo -e "  2. 粘贴文案 (已在剪贴板)"
  echo -e "  3. 添加标题"
  echo -e "  4. 发布"

  if wait_user; then
    update_manifest "xhs" "published"
    ok "小红书 → published"
  else
    update_manifest "xhs" "skipped"
    warn "小红书 → skipped"
  fi
}

# ─── 平台 3: 公众号 ───────────────────────────────────────────────────────────
publish_wechat() {
  should_publish "wechat" || return 0

  local article="$OUTPUT_DIR/5_wechat_article.md"

  if [[ ! -f "$article" ]]; then
    warn "公众号: 缺少 5_wechat_article.md，跳过"
    return 0
  fi

  platform_header "公众号" 3 4

  local content
  content=$(cat "$article")
  local word_count
  word_count=$(echo "$content" | wc -c | tr -d ' ')

  echo -e "  ${BOLD}文章:${RESET} 5_wechat_article.md (${word_count} chars)"
  echo -e "  ${BOLD}预览:${RESET}"
  head -8 "$article" | sed 's/^/    /'
  echo -e "    ${DIM}...${RESET}"

  if [[ -f "$OUTPUT_DIR/4_thumbnail.png" ]]; then
    echo -e "  ${BOLD}封面图:${RESET} $OUTPUT_DIR/4_thumbnail.png"
  fi

  # 复制文章到剪贴板
  clip "$content" "公众号文章"

  # 打开微信公众平台
  open "https://mp.weixin.qq.com/"
  info "已打开微信公众号后台"

  echo ""
  echo -e "  ${BOLD}操作步骤:${RESET}"
  echo -e "  1. 点击「图文消息」→「写新图文」"
  echo -e "  2. 粘贴文章 (已在剪贴板)"
  echo -e "  3. 上传封面图"
  echo -e "  4. 预览 → 发布"

  if wait_user; then
    update_manifest "wechat" "published"
    ok "公众号 → published"
  else
    update_manifest "wechat" "skipped"
    warn "公众号 → skipped"
  fi
}

# ─── 平台 4: X/Twitter ────────────────────────────────────────────────────────
publish_x() {
  should_publish "x" || return 0

  local thread_file="$OUTPUT_DIR/5_x_thread.json"
  local post_file="$OUTPUT_DIR/5_x_post.md"

  if [[ ! -f "$thread_file" && ! -f "$post_file" ]]; then
    warn "X: 缺少 5_x_thread.json 和 5_x_post.md，跳过"
    return 0
  fi

  platform_header "X / Twitter" 4 4

  # 检测 bird CLI
  local has_bird=false
  if command -v bird &>/dev/null; then
    # 检查 bird 是否有凭证
    if bird check &>/dev/null 2>&1; then
      has_bird=true
      info "检测到 bird CLI (已认证) → 自动发布模式"
    else
      info "检测到 bird CLI (未认证) → 半自动模式"
      echo -e "  ${DIM}提示: 登录 Chrome 的 x.com 后运行 bird check 可解锁自动发布${RESET}"
    fi
  fi

  # 优先发 thread，fallback 到单条
  if [[ -f "$thread_file" ]]; then
    local tweet_count
    tweet_count=$(THREAD_FILE="$thread_file" node -e '
      try {
        const d = JSON.parse(require("fs").readFileSync(process.env.THREAD_FILE, "utf8"));
        process.stdout.write(String(Array.isArray(d) ? d.length : 0));
      } catch(e) { process.stdout.write("0"); }
    ' 2>/dev/null || echo "0")

    echo -e "  ${BOLD}Thread:${RESET} ${tweet_count} 条推文"

    # 显示预览
    THREAD_FILE="$thread_file" node -e '
      const d = JSON.parse(require("fs").readFileSync(process.env.THREAD_FILE, "utf8"));
      if (Array.isArray(d)) {
        d.slice(0, 3).forEach((t, i) => {
          const text = t.tweet || t.text || t;
          console.log("    " + (i+1) + ". " + String(text).slice(0, 80) + (String(text).length > 80 ? "..." : ""));
        });
        if (d.length > 3) console.log("    ...(+" + (d.length - 3) + " more)");
      }
    ' 2>/dev/null || true

    if [[ "$has_bird" = true ]]; then
      echo ""
      echo -e "  ${BOLD}🤖 使用 bird CLI 自动发布 thread...${RESET}"

      # 逐条发推
      local prev_id=""
      local success=true
      while IFS= read -r tweet_text; do
        if [[ -z "$prev_id" ]]; then
          prev_id=$(bird tweet "$tweet_text" 2>/dev/null | grep -o 'id: [0-9]*' | head -1 | cut -d' ' -f2 || true)
          if [[ -n "$prev_id" ]]; then
            ok "Tweet 1 发布成功 (id: $prev_id)"
          else
            err "Tweet 1 发布失败"
            success=false
            break
          fi
        else
          prev_id=$(bird reply "$prev_id" "$tweet_text" 2>/dev/null | grep -o 'id: [0-9]*' | head -1 | cut -d' ' -f2 || true)
          if [[ -n "$prev_id" ]]; then
            ok "Reply 发布成功 (id: $prev_id)"
          else
            err "Reply 发布失败"
            success=false
            break
          fi
        fi
        sleep 2  # 避免 rate limit
      done < <(THREAD_FILE="$thread_file" node -e '
        const d = JSON.parse(require("fs").readFileSync(process.env.THREAD_FILE, "utf8"));
        if (Array.isArray(d)) {
          d.forEach(t => console.log(t.tweet || t.text || t));
        }
      ' 2>/dev/null)

      if [[ "$success" = true ]]; then
        update_manifest "x_thread" "published"
        ok "X Thread → published"
      else
        warn "X Thread 部分失败，请手动检查"
        update_manifest "x_thread" "failed"
      fi
      return 0
    fi
  fi

  # 半自动模式：复制第一条推文 + 打开 X
  if [[ -f "$thread_file" ]]; then
    local first_tweet
    first_tweet=$(THREAD_FILE="$thread_file" node -e '
      const d = JSON.parse(require("fs").readFileSync(process.env.THREAD_FILE, "utf8"));
      if (Array.isArray(d) && d.length > 0) {
        process.stdout.write(d[0].tweet || d[0].text || String(d[0]));
      }
    ' 2>/dev/null || true)
    clip "$first_tweet" "第一条推文"
  elif [[ -f "$post_file" ]]; then
    clip "$(cat "$post_file")" "X Post"
  fi

  open "https://x.com/compose/post"
  info "已打开 X 发推页面"

  echo ""
  echo -e "  ${BOLD}操作步骤:${RESET}"
  echo -e "  1. 粘贴推文 (已在剪贴板)"
  if [[ -f "$thread_file" ]]; then
    echo -e "  2. 发布后，依次回复剩余推文 (共 ${tweet_count} 条)"
    echo -e "     ${DIM}完整 thread 内容: $thread_file${RESET}"
  fi
  echo -e "  3. 发布"

  if wait_user; then
    update_manifest "x_thread" "published"
    update_manifest "x_post" "published"
    ok "X → published"
  else
    update_manifest "x_thread" "skipped"
    update_manifest "x_post" "skipped"
    warn "X → skipped"
  fi
}

# ─── 主流程 ───────────────────────────────────────────────────────────────────

# 验证基本文件存在
if [[ ! -f "$OUTPUT_DIR/4_video_meta.json" && ! -f "$OUTPUT_DIR/manifest.json" ]]; then
  err "输出目录缺少必要文件 (4_video_meta.json / manifest.json)"
  exit 1
fi

PUBLISH_START=$(date +%s)

publish_douyin
publish_xhs
publish_wechat
publish_x

PUBLISH_END=$(date +%s)
ELAPSED=$((PUBLISH_END - PUBLISH_START))
ELAPSED_FMT=$(printf '%dm%ds' $((ELAPSED/60)) $((ELAPSED%60)))

# ─── 发布汇总 ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}📤 发布完成！${RESET}  ${DIM}耗时: ${ELAPSED_FMT}${RESET}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# 读取 manifest 打印各平台状态
if [[ -f "$OUTPUT_DIR/manifest.json" ]]; then
  MANIFEST_FILE="$OUTPUT_DIR/manifest.json" node -e '
    const d = JSON.parse(require("fs").readFileSync(process.env.MANIFEST_FILE, "utf8"));
    const p = d.platforms || {};
    const icons = { published: "✅", skipped: "⏭", failed: "❌", pending: "⏳" };
    const platforms = [
      ["douyin",    "抖音"],
      ["xhs",       "小红书"],
      ["wechat",    "公众号"],
      ["x_thread",  "X Thread"],
      ["x_post",    "X Post"]
    ];
    for (const [key, name] of platforms) {
      const status = p[key]?.status || "pending";
      const icon = icons[status] || "❓";
      console.log("  " + icon + " " + name.padEnd(12) + status);
    }
  ' 2>/dev/null || true
fi

echo ""
echo -e "${DIM}输出目录: $OUTPUT_DIR${RESET}"
echo ""
