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
