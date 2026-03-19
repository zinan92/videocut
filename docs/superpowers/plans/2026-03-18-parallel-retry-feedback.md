# Parallel + Retry + Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the videocut pipeline faster (parallel Claude calls), more resilient (retry with backoff), and smarter over time (learn from user corrections).

**Architecture:** Three independent improvements to the existing bash/node pipeline. Improvement 1 parallelizes 5 sequential Claude CLI calls in Phase 3. Improvement 3 adds a `retry_claude` helper function used across all Claude CLI invocations. Improvement 5 captures the diff between AI suggestions and user edits, aggregates feedback, and injects it as few-shot examples into future AI analysis prompts.

**Tech Stack:** Bash, Node.js, Claude CLI

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `pipeline.sh` | Add `retry_claude()`, parallelize Phase 3 |
| Modify | `content-repurpose.sh` | Use `retry_claude()` for all Claude calls |
| Modify | `剪口播/scripts/review_server.js` | Save `3_feedback.json` on `/api/cut` |
| Modify | `run.sh` | Save feedback in `--no-server` mode, inject feedback into AI prompt |
| Create | `剪口播/scripts/feedback_aggregator.js` | Aggregate `3_feedback.json` across sessions |

---

## Task 1: Add `retry_claude()` helper to `pipeline.sh`

**Files:**
- Modify: `pipeline.sh:28-34` (add function after logging helpers)

- [ ] **Step 1: Add `retry_claude()` function after the logging helpers (line 34)**

Insert after line 34 (`skip() { ... }`):

```bash
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
```

- [ ] **Step 2: Verify syntax**

Run: `bash -n pipeline.sh`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add pipeline.sh
git commit -m "feat: add retry_claude() helper with exponential backoff"
```

---

## Task 2: Apply `retry_claude()` to Phase 3 Claude calls in `pipeline.sh`

**Files:**
- Modify: `pipeline.sh:239,265,291,324,349` (5 Claude calls in gen_* functions)

- [ ] **Step 1: Replace `claude` with `retry_claude` in gen_jike()**

Line 239, change:
```bash
    | claude -p --dangerously-skip-permissions --output-format text > "$OUT"
```
to:
```bash
    | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUT"
```

- [ ] **Step 2: Same replacement in gen_xhs() (line 265)**

- [ ] **Step 3: Same replacement in gen_wechat() (line 291)**

- [ ] **Step 4: Same replacement in gen_x_thread() (line 324)**

- [ ] **Step 5: Same replacement in gen_x_post() (line 349)**

- [ ] **Step 6: Verify syntax**

Run: `bash -n pipeline.sh`
Expected: no output

- [ ] **Step 7: Commit**

```bash
git add pipeline.sh
git commit -m "feat: apply retry_claude to all Phase 3 Claude calls"
```

---

## Task 3: Apply `retry_claude()` to `content-repurpose.sh`

**Files:**
- Modify: `content-repurpose.sh:76,99,161,209` (4 Claude calls)

- [ ] **Step 1: Copy `retry_claude()` function into content-repurpose.sh**

Insert after line 42 (`echo ""`), add the same `retry_claude()` function from Task 1. Also add the logging helpers it depends on:

```bash
# ─── 日志辅助 ──────────────────────────────────────────────────────────────
warn() { echo "⚠️  $*"; }
info() { echo "ℹ  $*"; }

# ─── retry_claude ──────────────────────────────────────────────────────────
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

  cat "$tmp_out"
  rm -f "$tmp_out" "$tmp_in"
  echo "❌ Claude CLI 调用失败，已重试 $max_retries 次" >&2
  return 1
}
```

- [ ] **Step 2: Replace 4 Claude calls**

Line 76 (步骤 B 中文文章):
```bash
echo "$CN_PROMPT" | claude -p --dangerously-skip-permissions > "$OUTPUT_DIR/4_article_cn.md"
```
→
```bash
echo "$CN_PROMPT" | retry_claude -p --dangerously-skip-permissions > "$OUTPUT_DIR/4_article_cn.md"
```

Line 99 (步骤 C 英文文章): same pattern

Line 161 (步骤 E 金句): same pattern

Line 209 (步骤 F 元数据):
```bash
echo "$META_PROMPT" | claude -p --dangerously-skip-permissions --output-format text > "$OUTPUT_DIR/4_video_meta.json"
```
→
```bash
echo "$META_PROMPT" | retry_claude -p --dangerously-skip-permissions --output-format text > "$OUTPUT_DIR/4_video_meta.json"
```

- [ ] **Step 3: Verify syntax**

Run: `bash -n content-repurpose.sh`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add content-repurpose.sh
git commit -m "feat: apply retry_claude to all content-repurpose.sh Claude calls"
```

---

## Task 4: Parallelize Phase 3 in `pipeline.sh`

**Files:**
- Modify: `pipeline.sh:358-364` (sequential gen_* calls → parallel)

- [ ] **Step 1: Replace the sequential calls with parallel execution**

Replace lines 358-364:
```bash
gen_jike
gen_xhs
gen_wechat
gen_x_thread
gen_x_post

ok "Phase 3 完成 → $OUTPUT_DIR"
```

With:
```bash
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
```

- [ ] **Step 2: Redirect gen_* function output to work in subshell**

Each `gen_*` function uses `info`, `ok`, `skip` which write to stdout. When running in background, their output goes to the log file via the subshell redirect. However, the functions also reference `$OUTPUT_DIR` and `$CN_CONTENT`/`$EN_CONTENT` — these are inherited correctly since subshell inherits parent variables. No changes needed to the functions themselves.

Verify: `bash -n pipeline.sh`

- [ ] **Step 3: Test dry run**

Run: `bash -x pipeline.sh --help 2>&1 | head -5`
Expected: shows usage/error (verifies script parses correctly)

- [ ] **Step 4: Commit**

```bash
git add pipeline.sh
git commit -m "feat: parallelize Phase 3 Claude calls (5 platforms concurrent)"
```

---

## Task 5: Capture feedback in `review_server.js`

**Files:**
- Modify: `剪口播/scripts/review_server.js:48-99` (`/api/cut` handler)

- [ ] **Step 1: Add feedback capture logic in `/api/cut` handler**

After line 56 (`console.log(...)`), before the output file generation (line 59), insert:

```javascript
        // ── Feedback Loop: 对比 AI 建议 vs 用户最终选择 ──
        const baseDir = process.cwd();
        const autoSelectedPath = path.join(baseDir, '2_auto_selected.json');
        const wordsPath = path.join(baseDir, '1_subtitles_words.json');

        if (fs.existsSync(autoSelectedPath) && fs.existsSync(wordsPath)) {
          try {
            const aiSelected = new Set(JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8')));
            const wordsData = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));

            // 从 deleteList (时间段) 反推用户选中的 word indices
            const userSelected = new Set();
            for (const seg of deleteList) {
              wordsData.forEach((w, i) => {
                if (w.start >= seg.start - 0.01 && w.end <= seg.end + 0.01) {
                  userSelected.add(i);
                }
              });
            }

            // AI 建议删但用户恢复的（误删）
            const aiOverDeleted = [...aiSelected].filter(i => !userSelected.has(i));
            // 用户新增删除的（AI 漏删）
            const aiUnderDeleted = [...userSelected].filter(i => !aiSelected.has(i));

            const feedback = {
              timestamp: new Date().toISOString(),
              total_words: wordsData.length,
              ai_selected_count: aiSelected.size,
              user_selected_count: userSelected.size,
              ai_over_deleted: aiOverDeleted.map(i => ({
                idx: i,
                text: wordsData[i]?.text || `[gap ${(wordsData[i]?.end - wordsData[i]?.start).toFixed(2)}s]`,
                time: `${wordsData[i]?.start.toFixed(2)}-${wordsData[i]?.end.toFixed(2)}`
              })),
              ai_under_deleted: aiUnderDeleted.map(i => ({
                idx: i,
                text: wordsData[i]?.text || `[gap ${(wordsData[i]?.end - wordsData[i]?.start).toFixed(2)}s]`,
                time: `${wordsData[i]?.start.toFixed(2)}-${wordsData[i]?.end.toFixed(2)}`
              }))
            };

            const feedbackPath = path.join(baseDir, '3_feedback.json');
            fs.writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2));
            console.log(`📊 Feedback: AI误删 ${aiOverDeleted.length}, AI漏删 ${aiUnderDeleted.length} → 3_feedback.json`);
          } catch (feedbackErr) {
            console.warn('⚠️ Feedback 生成失败:', feedbackErr.message);
          }
        }
```

- [ ] **Step 2: Verify syntax**

Run: `node -c 剪口播/scripts/review_server.js`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add 剪口播/scripts/review_server.js
git commit -m "feat: capture AI vs user feedback diff in 3_feedback.json"
```

---

## Task 6: Capture feedback in `--no-server` mode (`run.sh`)

**Files:**
- Modify: `run.sh:202-226` (`--no-server` branch)

In `--no-server` mode, there's no user review, so AI suggestions = final selection. No feedback diff to capture. However, we should still save a "baseline" feedback file so the aggregator knows this session had no corrections.

- [ ] **Step 1: Add baseline feedback after cut in --no-server mode**

After line 226 (`bash "$SCRIPT_DIR/cut_video.sh" ...`), insert:

```bash
  # 保存基线 feedback（无用户修正）
  node -e "
  const fs = require('fs');
  const feedback = {
    timestamp: new Date().toISOString(),
    mode: 'no-server',
    ai_selected_count: require('${BASE_DIR}/2_auto_selected.json').length,
    user_selected_count: require('${BASE_DIR}/2_auto_selected.json').length,
    ai_over_deleted: [],
    ai_under_deleted: [],
    note: 'Auto mode (--no-server), no user corrections'
  };
  fs.writeFileSync('${BASE_DIR}/3_feedback.json', JSON.stringify(feedback, null, 2));
  console.log('📊 Baseline feedback saved (no user review)');
  "
```

- [ ] **Step 2: Verify syntax**

Run: `bash -n run.sh`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add run.sh
git commit -m "feat: save baseline feedback in --no-server mode"
```

---

## Task 7: Create `feedback_aggregator.js`

**Files:**
- Create: `剪口播/scripts/feedback_aggregator.js`

This script scans all `output/*/3_feedback.json`, aggregates patterns, and writes a few-shot example file for the AI prompt.

- [ ] **Step 1: Create the aggregator script**

```javascript
#!/usr/bin/env node
/**
 * feedback_aggregator.js — 聚合用户修正反馈
 *
 * 用法: node feedback_aggregator.js [output_dir] [max_examples]
 *   output_dir: videocut 根目录下的 output/ (默认 ../../output)
 *   max_examples: 最多保留多少条 (默认 20)
 *
 * 输出: ../../剪口播/用户习惯/feedback_examples.md
 */

const fs = require('fs');
const path = require('path');

const scriptDir = __dirname;
const rootDir = path.resolve(scriptDir, '../..');
const outputDir = process.argv[2] || path.join(rootDir, 'output');
const maxExamples = parseInt(process.argv[3]) || 20;
const habitsDir = path.join(rootDir, '剪口播', '用户习惯');
const outFile = path.join(habitsDir, 'feedback_examples.md');

// 扫描所有 feedback 文件
const feedbackFiles = [];
if (fs.existsSync(outputDir)) {
  for (const dir of fs.readdirSync(outputDir)) {
    const fbPath = path.join(outputDir, dir, '3_feedback.json');
    if (fs.existsSync(fbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
        if (data.mode !== 'no-server') {
          feedbackFiles.push({ dir, ...data });
        }
      } catch (e) {
        // skip invalid
      }
    }
  }
}

if (feedbackFiles.length === 0) {
  console.log('No user-reviewed feedback found. Skipping.');
  process.exit(0);
}

// 按时间倒序，取最近 N 条
feedbackFiles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
const recent = feedbackFiles.slice(0, maxExamples);

// 统计模式
const overDeletedTexts = [];
const underDeletedTexts = [];

for (const fb of recent) {
  for (const item of (fb.ai_over_deleted || [])) {
    if (item.text && !item.text.startsWith('[gap')) {
      overDeletedTexts.push(item.text);
    }
  }
  for (const item of (fb.ai_under_deleted || [])) {
    if (item.text && !item.text.startsWith('[gap')) {
      underDeletedTexts.push(item.text);
    }
  }
}

// 生成 markdown
const lines = [
  '# 用户修正反馈（自动生成）',
  '',
  `> 基于最近 ${recent.length} 次有审核的剪辑会话自动聚合，供 AI 口误分析参考。`,
  `> 最后更新：${new Date().toISOString().split('T')[0]}`,
  '',
];

if (overDeletedTexts.length > 0) {
  lines.push('## AI 误删（用户恢复的内容）');
  lines.push('');
  lines.push('以下内容 AI 标记为删除，但用户认为应该保留。注意避免类似误删：');
  lines.push('');
  // 去重，取最多 15 个
  const unique = [...new Set(overDeletedTexts)].slice(0, 15);
  for (const t of unique) {
    lines.push(`- 「${t}」→ 用户保留`);
  }
  lines.push('');
}

if (underDeletedTexts.length > 0) {
  lines.push('## AI 漏删（用户新增删除的内容）');
  lines.push('');
  lines.push('以下内容 AI 未标记，但用户认为应该删除。注意识别类似模式：');
  lines.push('');
  const unique = [...new Set(underDeletedTexts)].slice(0, 15);
  for (const t of unique) {
    lines.push(`- 「${t}」→ 用户删除`);
  }
  lines.push('');
}

fs.mkdirSync(habitsDir, { recursive: true });

if (overDeletedTexts.length === 0 && underDeletedTexts.length === 0) {
  lines.push('AI 建议与用户选择完全一致，无修正记录。');
  lines.push('');
}

// 统计摘要
lines.push('## 统计摘要');
lines.push('');
lines.push(`| 指标 | 值 |`);
lines.push(`|------|-----|`);
lines.push(`| 会话数 | ${recent.length} |`);
lines.push(`| AI 误删总次数 | ${overDeletedTexts.length} |`);
lines.push(`| AI 漏删总次数 | ${underDeletedTexts.length} |`);
lines.push('');

fs.writeFileSync(outFile, lines.join('\n'));
console.log(`✅ Feedback aggregated → ${outFile}`);
console.log(`   Sessions: ${recent.length}, Over-deleted: ${overDeletedTexts.length}, Under-deleted: ${underDeletedTexts.length}`);
```

- [ ] **Step 2: Make executable**

Run: `chmod +x 剪口播/scripts/feedback_aggregator.js`

- [ ] **Step 3: Verify syntax**

Run: `node -c 剪口播/scripts/feedback_aggregator.js`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add 剪口播/scripts/feedback_aggregator.js
git commit -m "feat: add feedback_aggregator.js for learning from user corrections"
```

---

## Task 8: Inject feedback into AI prompt in `run.sh`

**Files:**
- Modify: `run.sh:121-161` (AI 口误分析 prompt construction)

- [ ] **Step 1: Run aggregator before AI analysis and inject feedback**

Before line 123 (`RULES_DIR=...`), insert:

```bash
# 运行 feedback aggregator（如果有历史反馈）
FEEDBACK_AGG="$(cd "$(dirname "$0")/剪口播/scripts" && pwd)/feedback_aggregator.js"
if [[ -f "$FEEDBACK_AGG" ]]; then
  node "$FEEDBACK_AGG" 2>/dev/null || true
fi
```

- [ ] **Step 2: Add feedback context to the AI prompt**

After line 130 (`done`), where `RULES_CONTEXT` is fully built, insert:

```bash
# 加载用户修正反馈（如果存在）
FEEDBACK_CONTEXT=""
FEEDBACK_FILE="$(cd "$(dirname "$0")/剪口播/用户习惯" && pwd)/feedback_examples.md"
if [[ -f "$FEEDBACK_FILE" ]]; then
  FEEDBACK_CONTEXT=$(cat "$FEEDBACK_FILE")
fi
```

Then in the AI_PROMPT (line 133), add the feedback section. After `${RULES_CONTEXT}`, add:

```bash
## 用户历史修正反馈
${FEEDBACK_CONTEXT}
```

The full modified prompt block becomes:
```bash
AI_PROMPT="你是视频口误分析专家。根据以下规则，分析 readable.txt 和 sentences.txt，找出所有应该删除的片段。

## 规则
${RULES_CONTEXT}

## 用户历史修正反馈
${FEEDBACK_CONTEXT}

## readable.txt（idx|内容|时间范围）
$(cat "${BASE_DIR}/2_readable.txt")
...（rest unchanged）"
```

- [ ] **Step 3: Verify syntax**

Run: `bash -n run.sh`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add run.sh
git commit -m "feat: inject user feedback into AI stutter analysis prompt"
```

---

## Task 9: Integration verification

- [ ] **Step 1: Verify all files parse correctly**

```bash
bash -n pipeline.sh && echo "pipeline.sh OK"
bash -n content-repurpose.sh && echo "content-repurpose.sh OK"
bash -n run.sh && echo "run.sh OK"
node -c 剪口播/scripts/review_server.js && echo "review_server.js OK"
node -c 剪口播/scripts/feedback_aggregator.js && echo "feedback_aggregator.js OK"
```

Expected: all 5 OK

- [ ] **Step 2: Verify feedback_aggregator runs without errors on empty output**

```bash
node 剪口播/scripts/feedback_aggregator.js ./nonexistent 2>&1
```

Expected: "No user-reviewed feedback found. Skipping." (exit 0)

- [ ] **Step 3: Verify pipeline.sh --help shows usage**

```bash
bash pipeline.sh 2>&1 | head -3
```

Expected: shows error about missing video path (confirms script loads)

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
git status
# If clean, skip. Otherwise:
git add -A && git commit -m "chore: integration cleanup"
```
