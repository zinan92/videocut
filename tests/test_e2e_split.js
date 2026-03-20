#!/usr/bin/env node
/**
 * test_e2e_split.js — E2E 拆条测试
 *
 * 用法: node tests/test_e2e_split.js <video_file>
 * 需要 Express server 在 localhost:3789 运行
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const VIDEO = process.argv[2];
if (!VIDEO || !fs.existsSync(VIDEO)) {
  console.error('用法: node tests/test_e2e_split.js <video_file>');
  process.exit(1);
}

const BASE = 'http://localhost:3789';
let PASS = 0;
let FAIL = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    PASS++;
  } else {
    console.log(`  ❌ ${label}`);
    FAIL++;
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
}

function uploadVideo() {
  const result = execFileSync('curl', [
    '-s', '-X', 'POST',
    '-F', `video=@${VIDEO}`,
    `${BASE}/api/upload`
  ], { encoding: 'utf8' });
  return JSON.parse(result);
}

function listenSSE(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SSE timeout (10 min)'));
    }, 10 * 60 * 1000);

    const urlObj = new URL(url);
    http.get(urlObj, (res) => {
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.slice(6));

              if (data.type === 'step') {
                console.log(`    ${data.message}`);
              }
              if (data.type === 'done') {
                clearTimeout(timeout);
                res.destroy();
                resolve(data);
              }
              if (data.type === 'error') {
                clearTimeout(timeout);
                res.destroy();
                reject(new Error(data.message));
              }
            } catch {}
          }
        }
      });

      res.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });
}

async function main() {
  console.log('\n═══ E2E 拆条测试 ═══');
  console.log(`视频: ${VIDEO}\n`);

  // Step 1: Upload
  console.log('Step 1: 上传视频...');
  const upload = uploadVideo();
  check('上传成功', !!upload.path);
  console.log(`  路径: ${upload.path}`);

  // Step 2: Transcribe (SSE)
  console.log('\nStep 2: 转录 (SSE)...');
  const encodedPath = encodeURIComponent(upload.path);
  const transcribeResult = await listenSSE(
    `${BASE}/api/split/transcribe?video=${encodedPath}`
  );

  const outputDir = transcribeResult.outputDir;
  check('转录完成', !!outputDir);
  check('转录文件存在', fs.existsSync(`output/${outputDir}/4_transcript.txt`));
  check('SRT 文件存在', fs.existsSync(`output/${outputDir}/1_subtitles.srt`));
  check('Words JSON 存在', fs.existsSync(`output/${outputDir}/1_subtitles_words.json`));

  // Step 3: Analyze chapters
  console.log('\nStep 3: AI 章节分析...');
  const analyzeResult = await fetchJson(`${BASE}/api/split/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputDir }),
  });

  const chapters = analyzeResult.chapters || [];
  check('章节分析成功', chapters.length > 0);
  console.log(`  章节数: ${chapters.length}`);

  if (chapters.length > 0) {
    check('章节有标题', !!chapters[0].title);
    check('章节有时间', !!chapters[0].start && !!chapters[0].end);
    check('章节有摘要', !!chapters[0].summary);
    console.log(`  第一章: ${chapters[0].title} (${chapters[0].start} - ${chapters[0].end})`);

    check('chapters.json 已保存', fs.existsSync(`output/${outputDir}/4_chapters.json`));
  }

  // Step 4: Execute split (前 2 个章节)
  console.log('\nStep 4: 执行切割...');
  const selectedChapters = chapters.slice(0, 2).map((ch, i) => ({ ...ch, index: i + 1 }));

  const splitResult = await fetchJson(`${BASE}/api/split/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outputDir,
      chapters: selectedChapters,
      videoPath: upload.path,
    }),
  });

  const results = splitResult.results || [];
  const successCount = results.filter(r => r.success).length;
  check('切割返回结果', results.length > 0);
  check('切割成功', successCount > 0);
  console.log(`  成功: ${successCount}/${results.length}`);

  // 验证 splits 目录
  const splitsDir = `output/${outputDir}/splits`;
  check('splits 目录存在', fs.existsSync(splitsDir));

  if (fs.existsSync(splitsDir)) {
    const mp4Files = fs.readdirSync(splitsDir).filter(f => f.endsWith('.mp4'));
    check(`MP4 文件数量 (${mp4Files.length})`, mp4Files.length === successCount);

    // 验证每个视频可播放
    for (const f of mp4Files) {
      const filePath = path.join(splitsDir, f);
      try {
        const dur = execFileSync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'csv=p=0',
          `file:${filePath}`
        ], { encoding: 'utf8' }).trim();
        const durSec = Math.floor(parseFloat(dur));
        check(`${f} 可播放 (${durSec}s)`, durSec > 0);
      } catch {
        check(`${f} 可播放`, false);
      }
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log(`结果: ✅ ${PASS} 通过  ❌ ${FAIL} 失败`);
  console.log('═══════════════════════════════════════\n');

  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
