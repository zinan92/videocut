'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const execFileAsync = promisify(execFile);

const { run, probe, extractAudio } = require('../../lib/ffmpeg.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a short synthetic test video using FFmpeg lavfi source.
 * Returns the path to the created file.
 */
async function createTestVideo(duration = 1) {
  const tmpDir = os.tmpdir();
  const outPath = path.join(tmpDir, `ffmpeg-test-${Date.now()}.mp4`);

  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  await execFileAsync(ffmpeg, [
    '-y',
    '-f', 'lavfi', '-i', `color=c=blue:s=320x240:r=25:d=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac',
    '-t', String(duration),
    outPath,
  ]);

  return outPath;
}

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

test('run() rejects with a meaningful error for a nonexistent input file', async () => {
  const nonexistent = '/tmp/does-not-exist-videocut-test.mp4';

  await assert.rejects(
    () => run(['-i', `file:${nonexistent}`, '-f', 'null', '-']),
    (err) => {
      assert.ok(err instanceof Error, 'should be an Error');
      assert.ok(err.message.length > 0, 'error message should not be empty');
      return true;
    }
  );
});

test('run() resolves and returns stdout/stderr on success', async () => {
  // `-version` exits 0 and writes to stdout
  const result = await run(['-version']);
  assert.ok(typeof result.stdout === 'string', 'stdout should be a string');
  assert.ok(typeof result.stderr === 'string', 'stderr should be a string');
  // FFmpeg version output contains "ffmpeg version"
  const combined = result.stdout + result.stderr;
  assert.ok(
    combined.toLowerCase().includes('ffmpeg'),
    'output should contain "ffmpeg"'
  );
});

// ---------------------------------------------------------------------------
// probe()
// ---------------------------------------------------------------------------

test('probe() returns correct duration for a 1-second test video', async () => {
  const videoPath = await createTestVideo(1);

  try {
    const info = await probe(videoPath);

    assert.ok(typeof info.duration === 'number', 'duration should be a number');
    // Allow a small tolerance (lavfi encoding can be a few ms off)
    assert.ok(
      info.duration >= 0.9 && info.duration <= 1.5,
      `duration should be ~1s, got ${info.duration}`
    );

    assert.strictEqual(info.width, 320, 'width should be 320');
    assert.strictEqual(info.height, 240, 'height should be 240');
    assert.ok(
      info.bitrate === null || typeof info.bitrate === 'number',
      'bitrate should be null or a number'
    );
  } finally {
    fs.rmSync(videoPath, { force: true });
  }
});

test('probe() rejects on a nonexistent file', async () => {
  await assert.rejects(
    () => probe('/tmp/no-such-file-videocut-test.mp4'),
    (err) => {
      assert.ok(err instanceof Error);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// extractAudio()
// ---------------------------------------------------------------------------

test('extractAudio() produces an MP3 file from a valid video', async () => {
  const videoPath = await createTestVideo(1);
  const audioPath = path.join(os.tmpdir(), `ffmpeg-test-audio-${Date.now()}.mp3`);

  try {
    const result = await extractAudio(videoPath, audioPath);
    assert.ok(typeof result.stderr === 'string', 'stderr should be a string');

    const stat = fs.statSync(audioPath);
    assert.ok(stat.size > 0, 'output MP3 should not be empty');
  } finally {
    fs.rmSync(videoPath, { force: true });
    fs.rmSync(audioPath, { force: true });
  }
});
