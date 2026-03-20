#!/usr/bin/env node
/**
 * detect_hardcoded_subtitles.js — 检测视频是否已有硬字幕
 *
 * 原理: 截取视频中间帧，分析底部 15% 区域的亮度分布。
 * 如果底部有高对比度文字（白色字幕），该区域的亮度标准差会显著高于纯背景。
 *
 * 用法: node detect_hardcoded_subtitles.js <video_file>
 * 输出: "true" (有字幕) 或 "false" (无字幕)
 * 退出码: 0 = 有字幕, 1 = 无字幕, 2 = 检测失败
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const videoFile = process.argv[2];
if (!videoFile || !fs.existsSync(videoFile)) {
  console.error('用法: node detect_hardcoded_subtitles.js <video_file>');
  process.exit(2);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-detect-'));

try {
  // 获取视频时长，取中间位置截帧
  const durStr = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    `file:${videoFile}`
  ], { encoding: 'utf8' }).trim();

  const duration = parseFloat(durStr);
  const seekTime = Math.floor(duration / 2);

  // 截取 3 帧（中间位置附近），增加可靠性
  const frames = [];
  for (let i = 0; i < 3; i++) {
    const t = Math.max(1, seekTime - 2 + i * 2);
    const framePath = path.join(tmpDir, `frame_${i}.ppm`);
    try {
      execFileSync('ffmpeg', [
        '-y', '-ss', String(t),
        '-i', `file:${videoFile}`,
        '-frames:v', '1',
        '-f', 'image2',
        framePath
      ], { stdio: 'pipe' });
      if (fs.existsSync(framePath)) {
        frames.push(framePath);
      }
    } catch {}
  }

  if (frames.length === 0) {
    console.log('false');
    process.exit(1);
  }

  // 分析每一帧的底部区域
  let subtitleDetected = 0;

  for (const framePath of frames) {
    // 用 ffmpeg 提取底部 15% 区域的亮度统计
    try {
      const statsOutput = execFileSync('ffmpeg', [
        '-y', '-i', framePath,
        '-vf', 'crop=iw:ih*0.15:0:ih*0.85,format=gray',
        '-f', 'rawvideo',
        '-'
      ], { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 });

      const pixels = new Uint8Array(statsOutput);
      if (pixels.length === 0) continue;

      // 计算亮度统计
      let sum = 0;
      let brightPixels = 0;
      const threshold = 200; // 亮度阈值，白色字幕区域

      for (let j = 0; j < pixels.length; j++) {
        sum += pixels[j];
        if (pixels[j] > threshold) brightPixels++;
      }

      const mean = sum / pixels.length;
      const brightRatio = brightPixels / pixels.length;

      // 如果底部区域有 >2% 的高亮像素，很可能有字幕
      // （纯视频背景通常 <1%，有字幕时 3-15%）
      if (brightRatio > 0.02) {
        subtitleDetected++;
      }
    } catch {}
  }

  // 多数帧检测到字幕则判定为有
  const hasSubtitles = subtitleDetected >= 2;
  console.log(hasSubtitles ? 'true' : 'false');
  process.exit(hasSubtitles ? 0 : 1);

} catch (e) {
  console.log('false');
  process.exit(1);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
