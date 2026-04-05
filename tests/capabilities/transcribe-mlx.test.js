'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { convertMlxResult } = require('../../capabilities/transcribe/index.js');

test('convertMlxResult() maps MLX segments into volcengine utterances', () => {
  const raw = {
    text: 'hello world',
    language: 'en',
    segments: [
      {
        start: 0.0,
        end: 1.2,
        text: ' hello world',
        words: [
          { word: ' hello', start: 0.0, end: 0.5, probability: 0.9 },
          { word: ' world', start: 0.5, end: 1.2, probability: 0.8 },
        ],
      },
    ],
  };

  const converted = convertMlxResult(raw);
  assert.deepStrictEqual(converted, {
    utterances: [
      {
        text: ' hello world',
        start_time: 0,
        end_time: 1200,
        words: [
          { text: ' hello', start_time: 0, end_time: 500 },
          { text: ' world', start_time: 500, end_time: 1200 },
        ],
      },
    ],
  });
});

test('convertMlxResult() tolerates segments without words', () => {
  const converted = convertMlxResult({
    segments: [{ start: 1.0, end: 2.0, text: ' fallback' }],
  });

  assert.deepStrictEqual(converted, {
    utterances: [
      {
        text: ' fallback',
        start_time: 1000,
        end_time: 2000,
        words: [],
      },
    ],
  });
});
