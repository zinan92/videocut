#!/usr/bin/env node
/**
 * generate_srt.js — 从 subtitles_words.json 生成 SRT 字幕文件
 *
 * 用法: node generate_srt.js <1_subtitles_words.json> [output.srt]
 *
 * 策略: 将连续的非 gap 词合并为句子（遇到 gap ≥0.5s 或句末标点则断句）
 *       每条字幕最多 20 个字符，超过则在中间断行
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('用法: node generate_srt.js <1_subtitles_words.json> [output.srt]');
  process.exit(1);
}

const outputFile = process.argv[3] || inputFile.replace(/1_subtitles_words\.json$/, '1_subtitles.srt');
const words = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// 格式化时间为 SRT 格式: HH:MM:SS,mmm
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// 句末标点
const SENTENCE_ENDS = /[。！？.!?]/;

// 合并词为字幕段
const subtitles = [];
let currentText = '';
let currentStart = -1;
let currentEnd = -1;

for (let i = 0; i < words.length; i++) {
  const w = words[i];

  if (w.isGap) {
    const gapDuration = w.end - w.start;
    // gap ≥ 0.5s 则断句
    if (gapDuration >= 0.5 && currentText.length > 0) {
      subtitles.push({ start: currentStart, end: currentEnd, text: currentText });
      currentText = '';
      currentStart = -1;
      currentEnd = -1;
    }
    continue;
  }

  // 非 gap 词
  if (currentStart < 0) currentStart = w.start;
  currentText += w.text;
  currentEnd = w.end;

  // 句末标点断句
  if (SENTENCE_ENDS.test(w.text)) {
    subtitles.push({ start: currentStart, end: currentEnd, text: currentText });
    currentText = '';
    currentStart = -1;
    currentEnd = -1;
    continue;
  }

  // 超过 15 个字符且遇到下一个 gap 时断句
  if (currentText.length >= 15) {
    const next = words[i + 1];
    if (!next || next.isGap) {
      subtitles.push({ start: currentStart, end: currentEnd, text: currentText });
      currentText = '';
      currentStart = -1;
      currentEnd = -1;
    }
  }
}

// 最后一段
if (currentText.length > 0) {
  subtitles.push({ start: currentStart, end: currentEnd, text: currentText });
}

// 生成 SRT
const srt = subtitles.map((sub, i) => {
  return `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
}).join('\n');

fs.writeFileSync(outputFile, srt);
console.log(`✅ 生成 SRT: ${path.basename(outputFile)} (${subtitles.length} 条字幕)`);
