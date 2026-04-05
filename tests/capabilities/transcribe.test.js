'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  run,
  resolveBackend,
  resolveDevice,
  resolveMlxPython,
  resolveMlxModel,
} = require('../../capabilities/transcribe/index.js');

test('transcribe module exports run function', () => {
  assert.strictEqual(typeof run, 'function');
});

test('Apple Silicon defaults to mlx backend', () => {
  assert.strictEqual(
    resolveBackend({}, { platform: 'darwin', arch: 'arm64' }),
    'mlx'
  );
});

test('non-Apple environments default to whisper backend', () => {
  assert.strictEqual(
    resolveBackend({}, { platform: 'linux', arch: 'x64' }),
    'whisper'
  );
});

test('explicit whisper backend is allowed on Apple Silicon', () => {
  assert.strictEqual(
    resolveBackend({ backend: 'whisper' }, { platform: 'darwin', arch: 'arm64' }),
    'whisper'
  );
});

test('Apple Silicon whisper backend still defaults to mps', () => {
  assert.strictEqual(
    resolveDevice({}, { platform: 'darwin', arch: 'arm64' }),
    'mps'
  );
});

test('explicit cpu is rejected', () => {
  assert.throws(
    () => resolveDevice({ device: 'cpu' }, { platform: 'darwin', arch: 'arm64' }),
    /CPU.*disabled/i
  );
});

test('non-accelerated environments fail instead of falling back to cpu', () => {
  assert.throws(
    () => resolveDevice({}, { platform: 'linux', arch: 'x64' }),
    /No supported accelerated transcription device/i
  );
});

test('mlx runtime prefers explicit environment variable', () => {
  const resolved = resolveMlxPython(
    { MLX_WHISPER_PYTHON: '/custom/mlx/python' },
    (candidate) => candidate === '/custom/mlx/python'
  );
  assert.strictEqual(resolved, '/custom/mlx/python');
});

test('mlx runtime resolves repo-local venv when present', () => {
  const repoPython = '/repo/.venv-mlx-whisper/bin/python3';
  const resolved = resolveMlxPython(
    {},
    (candidate) => candidate === repoPython,
    { repoRoot: '/repo' }
  );
  assert.strictEqual(resolved, repoPython);
});

test('mlx runtime throws a clear install error when missing', () => {
  assert.throws(
    () => resolveMlxPython({}, () => false, { repoRoot: '/repo' }),
    /mlx-whisper runtime is not installed/i
  );
});

test('mlx model resolver maps small to the Apple-Silicon model repo', () => {
  assert.strictEqual(resolveMlxModel('small'), 'mlx-community/whisper-small-mlx');
});

test('run() rejects when input file does not exist', async () => {
  await assert.rejects(
    () => run({ input: '/tmp/nonexistent_video.mp4', outputDir: '/tmp/transcribe_test_out' }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('/tmp/nonexistent_video.mp4'));
      return true;
    }
  );
});
