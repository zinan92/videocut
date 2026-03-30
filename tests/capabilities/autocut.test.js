'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildDeleteSegments, buildFeedback } = require('../../capabilities/autocut/index.js');

// Sample word array used across tests
const words = [
  { text: '好',   start: 0.0,  end: 0.3  },
  { text: '那',   start: 0.4,  end: 0.6  },
  { text: '今天', start: 0.7,  end: 1.0  },
  { text: '我们', start: 1.1,  end: 1.5  },
  { text: '就',   start: 1.6,  end: 1.8  },
];

// ── buildDeleteSegments ────────────────────────────────────────────────────

test('buildDeleteSegments() converts word indices to time ranges', () => {
  const result = buildDeleteSegments(words, [0, 2]);

  assert.strictEqual(result.length, 2);
  assert.deepEqual(result[0], { start: 0.0, end: 0.3 });
  assert.deepEqual(result[1], { start: 0.7, end: 1.0 });
});

test('buildDeleteSegments() merges adjacent segments with gap < 0.05s', () => {
  // words[1].end = 0.6, words[2].start = 0.7 → gap = 0.1 (NOT merged)
  // words[0].end = 0.3, words[1].start = 0.4 → gap = 0.1 (NOT merged)
  // Create words where gap between two is very small (< 0.05s)
  const closeWords = [
    { text: 'a', start: 0.0,  end: 0.5  },
    { text: 'b', start: 0.53, end: 0.9  }, // gap = 0.03s → should merge
    { text: 'c', start: 2.0,  end: 2.5  }, // far away → separate segment
  ];

  const result = buildDeleteSegments(closeWords, [0, 1, 2]);

  assert.strictEqual(result.length, 2, 'adjacent segments within 0.05s should be merged');
  assert.deepEqual(result[0], { start: 0.0, end: 0.9 });
  assert.deepEqual(result[1], { start: 2.0, end: 2.5 });
});

test('buildDeleteSegments() returns empty array for empty indices', () => {
  const result = buildDeleteSegments(words, []);
  assert.deepEqual(result, []);
});

test('buildDeleteSegments() sorts segments by start time', () => {
  // Pass indices out of order to verify sorting
  const result = buildDeleteSegments(words, [4, 0]);

  assert.strictEqual(result.length, 2);
  assert.ok(result[0].start < result[1].start, 'segments should be sorted by start time');
});

// ── buildFeedback ──────────────────────────────────────────────────────────

test('buildFeedback() records correct counts', () => {
  const silenceIndices = [1, 3];
  const aiIndices = [2, 4];

  const fb = buildFeedback(silenceIndices, aiIndices);

  assert.strictEqual(fb.silence_count, 2);
  assert.strictEqual(fb.ai_count, 2);
  assert.strictEqual(fb.total_count, 4);
  assert.deepEqual(fb.silence_indices, [1, 3]);
  assert.deepEqual(fb.ai_indices, [2, 4]);
  assert.ok(typeof fb.timestamp === 'string', 'timestamp should be a string');
  assert.ok(fb.timestamp.includes('T'), 'timestamp should be ISO format');
});

test('buildFeedback() deduplicates overlapping indices in total_count', () => {
  const silenceIndices = [1, 2];
  const aiIndices = [2, 3]; // index 2 appears in both

  const fb = buildFeedback(silenceIndices, aiIndices);

  assert.strictEqual(fb.silence_count, 2);
  assert.strictEqual(fb.ai_count, 2);
  assert.strictEqual(fb.total_count, 3, 'overlapping index 2 should only count once');
});

test('buildFeedback() handles empty inputs', () => {
  const fb = buildFeedback([], []);

  assert.strictEqual(fb.silence_count, 0);
  assert.strictEqual(fb.ai_count, 0);
  assert.strictEqual(fb.total_count, 0);
});
