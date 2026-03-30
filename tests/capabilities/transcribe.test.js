'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../../capabilities/transcribe/index.js');

test('transcribe module exports run function', () => {
  assert.strictEqual(typeof run, 'function');
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
