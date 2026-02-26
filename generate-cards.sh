#!/usr/bin/env bash
# generate-cards.sh
# 输入：quotes.json（路径通过参数传入，默认找同级 4_内容降维/quotes.json）
# 输出：4_内容降维/cards/card_1.png, card_2.png ...
# 方案：HTML 模板 + Chrome Headless 截图

set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ──────────────────────────────────────────────
# 参数解析
# ──────────────────────────────────────────────
# 用法：
#   generate-cards.sh <quotes.json>
#   generate-cards.sh             # 自动找 ./4_内容降维/quotes.json
#
# 脚本也可以放在 output/<date>.mov/ 目录下运行，
# 会自动向下寻找 4_内容降维/quotes.json

QUOTES_JSON="${1:-}"

if [[ -z "$QUOTES_JSON" ]]; then
  # 从当前目录自动查找
  QUOTES_JSON="$(find . -path "*/4_内容降维/quotes.json" | head -1)"
fi

if [[ -z "$QUOTES_JSON" || ! -f "$QUOTES_JSON" ]]; then
  echo "❌ 找不到 quotes.json，用法：$0 <path/to/quotes.json>"
  exit 1
fi

QUOTES_JSON="$(realpath "$QUOTES_JSON")"
BASE_DIR="$(dirname "$QUOTES_JSON")"
CARDS_DIR="$BASE_DIR/cards"

mkdir -p "$CARDS_DIR"
echo "📂 输出目录：$CARDS_DIR"

# ──────────────────────────────────────────────
# 用 node 解析 JSON，逐条生成 HTML + 截图
# ──────────────────────────────────────────────
node - "$QUOTES_JSON" "$CARDS_DIR" "$CHROME" <<'NODE_SCRIPT'
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os   = require('os');

const [,, quotesPath, cardsDir, chromeBin] = process.argv;
const quotes = JSON.parse(fs.readFileSync(quotesPath, 'utf8'));

function buildHtml(quote, context) {
  // 自动处理长文本换行，强制在合理位置插入 <br>
  const escaped = (s) =>
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 1080px;
    height: 1080px;
    overflow: hidden;
    background: #1a1a2e;
    font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC",
                 "Source Han Sans CN", -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .card {
    width: 1080px;
    height: 1080px;
    background: #1a1a2e;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* 左侧亮色竖线 */
  .left-bar {
    position: absolute;
    left: 72px;
    top: 180px;
    bottom: 180px;
    width: 5px;
    background: linear-gradient(180deg, #e94560 0%, #ff6b8a 100%);
    border-radius: 3px;
  }

  /* 微弱光晕背景装饰 */
  .glow {
    position: absolute;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(233,69,96,0.08) 0%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* 主内容区域 */
  .content {
    position: absolute;
    left: 120px;
    right: 100px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 48px;
  }

  .quote {
    color: #ffffff;
    font-size: 52px;
    font-weight: 700;
    line-height: 1.5;
    letter-spacing: 0.02em;
    text-align: left;
    word-break: break-all;
  }

  /* 引号装饰 */
  .quote::before {
    content: '"';
    color: #e94560;
    font-size: 80px;
    font-weight: 900;
    line-height: 0;
    vertical-align: -0.3em;
    margin-right: 8px;
    font-family: Georgia, serif;
  }

  .divider {
    width: 60px;
    height: 2px;
    background: #e94560;
    opacity: 0.6;
  }

  .context {
    color: rgba(255,255,255,0.55);
    font-size: 30px;
    font-weight: 400;
    line-height: 1.6;
    letter-spacing: 0.01em;
    text-align: left;
  }

  /* 底部水印 */
  .watermark {
    position: absolute;
    bottom: 56px;
    right: 80px;
    color: rgba(255,255,255,0.25);
    font-size: 26px;
    font-weight: 500;
    letter-spacing: 0.05em;
  }

  /* 顶部装饰点 */
  .dots {
    position: absolute;
    top: 64px;
    left: 72px;
    display: flex;
    gap: 10px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dot-1 { background: #e94560; }
  .dot-2 { background: rgba(233,69,96,0.5); }
  .dot-3 { background: rgba(233,69,96,0.2); }

</style>
</head>
<body>
<div class="card">
  <div class="glow"></div>
  <div class="left-bar"></div>

  <div class="dots">
    <div class="dot dot-1"></div>
    <div class="dot dot-2"></div>
    <div class="dot dot-3"></div>
  </div>

  <div class="content">
    <div class="quote">${escaped(quote)}</div>
    <div class="divider"></div>
    <div class="context">${escaped(context)}</div>
  </div>

  <div class="watermark">@xparkzz</div>
</div>
</body>
</html>`;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
let success = 0;
let fail = 0;

quotes.forEach((item, i) => {
  const idx  = i + 1;
  const html = buildHtml(item.quote, item.context);
  const htmlPath  = path.join(tmpDir, `card_${idx}.html`);
  const cardPath  = path.join(cardsDir, `card_${idx}.png`);

  fs.writeFileSync(htmlPath, html, 'utf8');

  try {
    execSync(`"${chromeBin}" \
      --headless=new \
      --disable-gpu \
      --no-sandbox \
      --disable-extensions \
      --hide-scrollbars \
      --window-size=1080,1080 \
      --screenshot="${cardPath}" \
      "file://${htmlPath}" \
      2>/dev/null`, { stdio: 'pipe' });

    console.log(`✅ card_${idx}.png  →  ${item.quote.slice(0, 20)}...`);
    success++;
  } catch(e) {
    console.error(`❌ card_${idx} 失败：${e.message}`);
    fail++;
  }
});

// 清理临时 HTML
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n🎴 完成：${success} 张成功，${fail} 张失败`);
console.log(`📁 输出：${cardsDir}`);
process.exit(fail > 0 ? 1 : 0);
NODE_SCRIPT
