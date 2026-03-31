'use strict';

// capabilities/hook/index.js — AI 选金句 + SRT 匹配 + FFmpeg 剪切拼接

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { run: transcribe } = require('../transcribe/index');
const { callClaude, parseAIOutput } = require('../../lib/claude');
const { matchHooksToSRT } = require('./match');

const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';

const H264_ARGS = [
  '-c:v', 'libx264',
  '-crf', '20',
  '-preset', 'fast',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '192k',
];

/**
 * Build a Claude prompt that asks for 6-8 hook quotes from a transcript.
 * @param {string} transcriptText - plain text of the video transcript
 * @returns {string}
 */
function buildQuotePrompt(transcriptText) {
  return `你是一位擅长短视频钩子设计的内容策略师。请从以下视频文字稿中选出 6-8 句最吸引人的金句，用于制作短视频开头钩子。

要求：
1. 每句必须来自原文（original_text 字段存储原文）
2. quote_text 可以是稍微精炼的版本（但字数不超过原文）
3. hook_score 为 1-10 分（越高越吸引人）
4. category 选择: controversial / surprising / emotional / practical / story

请以 JSON 数组返回，格式如下：
[
  {
    "original_text": "...",
    "quote_text": "...",
    "hook_score": 9,
    "category": "controversial"
  }
]

文字稿：
${transcriptText}`;
}

/**
 * Find an existing SRT file in outputDir.
 * Checks subtitle.srt and transcript.srt.
 * @param {string} outputDir
 * @returns {string|null} absolute path or null
 */
function findExistingSRT(outputDir) {
  const candidates = ['subtitle.srt', 'transcript.srt'];
  for (const name of candidates) {
    const p = path.join(outputDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Cut a single segment from the source video using FFmpeg.
 * @param {string} input - source video path
 * @param {object} seg - segment with start/end
 * @param {string} outFile - output file path
 * @returns {Promise<void>}
 */
async function cutSegment(input, seg, outFile) {
  const dur = (seg.end - seg.start).toFixed(3);
  await execFileAsync(FFMPEG, [
    '-y',
    '-ss', String(seg.start),
    '-i', `file:${input}`,
    '-t', dur,
    ...H264_ARGS,
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Concatenate part files into a single output using FFmpeg concat demuxer.
 * @param {string[]} partFiles - list of H.264 mp4 part files
 * @param {string} listFile - path to write the concat list
 * @param {string} outFile - final output file path
 * @returns {Promise<void>}
 */
async function concatParts(partFiles, listFile, outFile) {
  const listContent = partFiles.map((f) => `file '${f}'`).join('\n') + '\n';
  fs.writeFileSync(listFile, listContent, 'utf8');

  await execFileAsync(FFMPEG, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-c', 'copy',
    outFile,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Run the hook capability: select quotes via AI, match to SRT timestamps,
 * cut segments with FFmpeg, and concat into a single hook video.
 *
 * @param {object} params
 * @param {string} params.input - path to source video
 * @param {string} params.outputDir - directory for all outputs
 * @param {object} [params.options]
 * @param {number} [params.options.maxCount=4] - max number of hook segments
 * @param {number} [params.options.maxDuration=10] - max segment duration in seconds
 * @param {boolean} [params.options.strictMode=false] - strict matching mode
 * @returns {Promise<{ video: string, json: string, artifacts: object }>}
 */
async function run({ input, outputDir, options = {} }) {
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const maxCount = options.maxCount !== undefined ? options.maxCount : 4;
  const maxDuration = options.maxDuration !== undefined ? options.maxDuration : 10;
  const strictMode = options.strictMode || false;

  // Step 1: Find or generate SRT
  let srtPath = findExistingSRT(outputDir);
  if (!srtPath) {
    const result = await transcribe({ input, outputDir });
    srtPath = result.artifacts.srtPath;
  }
  const srtContent = fs.readFileSync(srtPath, 'utf8');

  // Step 2: Read transcript text for the AI prompt
  const txtPath = path.join(outputDir, 'transcript.txt');
  let transcriptText = '';
  if (fs.existsSync(txtPath)) {
    transcriptText = fs.readFileSync(txtPath, 'utf8');
  } else {
    // Fall back to extracting text from SRT
    transcriptText = srtContent
      .split('\n')
      .filter((l) => l && !/^\d+$/.test(l.trim()) && !l.includes('-->'))
      .join('');
  }

  // Step 3: AI quote selection (with fallback)
  let quotes;
  try {
    const prompt = buildQuotePrompt(transcriptText);
    quotes = await callClaude(prompt, { parser: parseAIOutput });
    if (!Array.isArray(quotes) || quotes.length === 0) {
      throw new Error('Empty or invalid response');
    }
  } catch (aiError) {
    console.log(`  AI quote selection failed: ${aiError.message}`);
    console.log('  Falling back to using full transcript as single quote...');
    quotes = [{
      original_text: transcriptText.trim(),
      quote_text: transcriptText.trim().slice(0, 200),
      hook_score: 5,
      category: 'practical',
    }];
  }

  // Step 4: Write hooks.json
  const hooksJsonPath = path.join(outputDir, 'hooks.json');
  fs.writeFileSync(hooksJsonPath, JSON.stringify(quotes, null, 2), 'utf8');

  // Step 5: Match quotes to SRT timestamps
  let segments, hookCount, totalDuration;
  try {
    const matched = matchHooksToSRT(
      quotes,
      srtContent,
      { maxCount, maxDuration, strictMode }
    );
    segments = matched.segments;
    hookCount = matched.hookCount;
    totalDuration = matched.totalDuration;
  } catch (matchError) {
    // Fallback: use the first N seconds of the video as the hook
    console.log(`  SRT matching failed: ${matchError.message}`);
    console.log('  Falling back to first 10 seconds as hook...');
    segments = [{ start: 0, end: Math.min(10, maxDuration) }];
    hookCount = 1;
    totalDuration = segments[0].end;
  }

  if (segments.length === 0) {
    // Last resort: first 10 seconds
    console.log('  No segments found, using first 10 seconds...');
    segments = [{ start: 0, end: Math.min(10, maxDuration) }];
    hookCount = 1;
    totalDuration = segments[0].end;
  }

  // Step 6: FFmpeg cut each segment
  const partFiles = [];
  const artifacts = { parts: [], hooksJsonPath, srtPath };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const partFile = path.join(outputDir, `_hook_part_${i + 1}.mp4`);
    await cutSegment(input, seg, partFile);
    partFiles.push(partFile);
    artifacts.parts.push(partFile);
  }

  // Step 7: Concat all parts into 3_hook.mp4
  const concatListFile = path.join(outputDir, '_hook_concat.txt');
  const hookFile = path.join(outputDir, '3_hook.mp4');
  await concatParts(partFiles, concatListFile, hookFile);

  // Cleanup temp files
  [concatListFile, ...partFiles].forEach((f) => {
    try { fs.unlinkSync(f); } catch (_) {}
  });

  artifacts.hookCount = hookCount;
  artifacts.totalDuration = totalDuration;

  return {
    video: hookFile,
    json: hooksJsonPath,
    artifacts,
  };
}

module.exports = { run };
