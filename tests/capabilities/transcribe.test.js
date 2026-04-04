'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { run, resolveDevice } = require('../../capabilities/transcribe/index.js');

test('transcribe module exports run function', () => {
  assert.strictEqual(typeof run, 'function');
});

test('Apple Silicon defaults to mps', () => {
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
