'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.resolve(__dirname, '../cli.js');

function runCli(args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { env: process.env }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? error.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

function runCliWithEnv(args, env) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? error.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

function makeSilentAudio() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'videocut-cli-'));
  const audioPath = path.join(tmpDir, 'sample.mp3');
  execFileSync('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'anullsrc=r=16000:cl=mono',
    '-t', '0.2',
    '-q:a', '9',
    '-acodec', 'libmp3lame',
    '-y',
    audioPath,
  ], { stdio: 'ignore' });
  return { tmpDir, audioPath };
}

describe('cli', () => {
  it('shows help when no args given', async () => {
    const { stdout, exitCode } = await runCli([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('videocut'), 'stdout should include "videocut"');
    assert.ok(stdout.includes('transcribe'), 'stdout should include "transcribe"');
    assert.ok(stdout.includes('autocut'), 'stdout should include "autocut"');
  });

  it('shows help when "help" is the capability', async () => {
    const { stdout, exitCode } = await runCli(['help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('videocut'), 'stdout should include "videocut"');
    assert.ok(stdout.includes('transcribe'), 'stdout should include "transcribe"');
  });

  it('errors on unknown capability with exit code 1', async () => {
    const { exitCode, stderr } = await runCli(['bogus']);
    assert.equal(exitCode, 1);
    assert.ok(
      stderr.includes('Unknown capability') && stderr.includes('bogus'),
      `stderr should include 'Unknown capability: "bogus"', got: ${stderr}`
    );
  });

  it('errors on missing input file with exit code 1', async () => {
    const { exitCode, stderr } = await runCli(['transcribe', '/nonexistent/file.mp4']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('not found'), `stderr should mention file not found, got: ${stderr}`);
  });

  it('prints a clean user-facing error when cpu transcription is requested', async () => {
    const { tmpDir, audioPath } = makeSilentAudio();
    const outputDir = path.join(tmpDir, 'out');

    const { exitCode, stderr } = await runCli([
      'transcribe',
      audioPath,
      '--backend',
      'whisper',
      '--device',
      'cpu',
      '-o',
      outputDir,
    ]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /CPU transcription is disabled/i);
    assert.doesNotMatch(stderr, /node:internal|Error: Command failed/i);
  });

  it('prints a clean user-facing error when accelerated transcription fails', async () => {
    const { tmpDir, audioPath } = makeSilentAudio();
    const outputDir = path.join(tmpDir, 'out');

    const { exitCode, stderr } = await runCliWithEnv(
      ['transcribe', audioPath, '--backend', 'mlx', '-o', outputDir],
      { MLX_WHISPER_PYTHON: '/missing/mlx/python' }
    );
    assert.equal(exitCode, 1);
    assert.match(stderr, /mlx-whisper runtime is not installed/i);
    assert.doesNotMatch(stderr, /node:internal|Error: Command failed/i);
  });
});
