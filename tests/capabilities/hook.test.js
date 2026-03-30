'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { matchHooksToSRT } = require('../../capabilities/hook/match.js');

// SRT with two entries; each entry has high char density (fast speech)
// so the speed filter (>= 0.8 * avgSpeed) passes for cross-entry matches
const SAMPLE_SRT = `1
00:00:00,500 --> 00:00:01,000
你好

2
00:00:01,000 --> 00:00:02,000
世界很大
`;

// Quote whose original_text matches within entry 2 only (no cross-entry speed issue)
const QUOTE_SINGLE_ENTRY = {
  original_text: '世界很大',
  quote_text: '世界很大',
  hook_score: 8,
  category: 'surprising',
};

test('matchHooksToSRT() finds exact quote in SRT', () => {
  const result = matchHooksToSRT([QUOTE_SINGLE_ENTRY], SAMPLE_SRT, {
    maxCount: 4,
    maxDuration: 10,
  });

  assert.ok(Array.isArray(result.segments), 'segments is an array');
  assert.strictEqual(result.segments.length, 1, 'one segment matched');

  const seg = result.segments[0];
  // Segment may be auto-expanded (< 3s) but must start at or after the SRT start (0.5s)
  assert.ok(seg.start >= 0.5, `start (${seg.start}) >= 0.5`);
  // end should come from entry 2 (00:00:02.000) — may be trimmed by suspense cut
  assert.ok(seg.end > seg.start, 'end > start');
  // The matched text is in entry 2, so end must be close to 2.0s (or 1.5s after suspense cut)
  assert.ok(seg.end <= 2.0, `end (${seg.end}) <= 2.0`);
  assert.strictEqual(result.hookCount, 1);
  assert.ok(result.totalDuration > 0, 'totalDuration > 0');
});

test('matchHooksToSRT() returns empty segments for unmatched quote', () => {
  const noMatchQuote = {
    original_text: '完全不存在的内容XYZABC',
    quote_text: '完全不存在的内容',
    hook_score: 9,
    category: 'controversial',
  };

  const result = matchHooksToSRT([noMatchQuote], SAMPLE_SRT, {
    maxCount: 4,
    maxDuration: 10,
  });

  assert.ok(Array.isArray(result.segments), 'segments is an array');
  assert.strictEqual(result.segments.length, 0, 'no segments for unmatched quote');
  assert.strictEqual(result.hookCount, 0);
  assert.strictEqual(result.totalDuration, 0);
});
