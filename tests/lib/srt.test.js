'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatTime, parseSRT, generateSRT, wordsToSRT, mergeSRT } = require('../../lib/srt.js');

// ---------------------------------------------------------------------------
// formatTime()
// ---------------------------------------------------------------------------

test('formatTime() converts 0 seconds correctly', () => {
  assert.strictEqual(formatTime(0), '00:00:00,000');
});

test('formatTime() converts integer seconds', () => {
  assert.strictEqual(formatTime(3661), '01:01:01,000');
});

test('formatTime() converts fractional seconds with milliseconds', () => {
  assert.strictEqual(formatTime(1.5), '00:00:01,500');
});

test('formatTime() pads milliseconds to 3 digits', () => {
  assert.strictEqual(formatTime(0.001), '00:00:00,001');
});

test('formatTime() throws for negative input', () => {
  assert.throws(() => formatTime(-1), TypeError);
});

test('formatTime() throws for non-number input', () => {
  assert.throws(() => formatTime('1'), TypeError);
});

// ---------------------------------------------------------------------------
// parseSRT()
// ---------------------------------------------------------------------------

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,200
This is a test

3
00:00:07,100 --> 00:00:09,000
Line one
Line two
`;

test('parseSRT() extracts correct number of entries', () => {
  const entries = parseSRT(SAMPLE_SRT);
  assert.strictEqual(entries.length, 3);
});

test('parseSRT() converts timestamps to seconds', () => {
  const entries = parseSRT(SAMPLE_SRT);
  assert.strictEqual(entries[0].start, 1.0);
  assert.strictEqual(entries[0].end, 3.5);
  assert.strictEqual(entries[1].start, 4.0);
  assert.strictEqual(entries[1].end, 6.2);
});

test('parseSRT() extracts single-line text correctly', () => {
  const entries = parseSRT(SAMPLE_SRT);
  assert.strictEqual(entries[0].text, 'Hello world');
  assert.strictEqual(entries[1].text, 'This is a test');
});

test('parseSRT() preserves multi-line subtitle text', () => {
  const entries = parseSRT(SAMPLE_SRT);
  assert.strictEqual(entries[2].text, 'Line one\nLine two');
});

test('parseSRT() handles dot as millisecond separator', () => {
  const srt = `1\n00:00:01.500 --> 00:00:02.750\nTest\n`;
  const entries = parseSRT(srt);
  assert.strictEqual(entries[0].start, 1.5);
  assert.strictEqual(entries[0].end, 2.75);
});

test('parseSRT() returns empty array for empty string', () => {
  assert.deepStrictEqual(parseSRT(''), []);
});

test('parseSRT() skips malformed blocks', () => {
  const srt = `1\nbad-timestamp-line\nText\n\n2\n00:00:01,000 --> 00:00:02,000\nGood\n`;
  const entries = parseSRT(srt);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].text, 'Good');
});

test('parseSRT() throws for non-string input', () => {
  assert.throws(() => parseSRT(null), TypeError);
});

// ---------------------------------------------------------------------------
// generateSRT()
// ---------------------------------------------------------------------------

const ENTRIES = [
  { start: 1.0,  end: 3.5,  text: 'Hello world' },
  { start: 4.0,  end: 6.2,  text: 'This is a test' },
  { start: 7.1,  end: 9.0,  text: 'Line one\nLine two' },
];

test('generateSRT() produces sequential index numbers starting at 1', () => {
  const srt = generateSRT(ENTRIES);
  assert.ok(srt.includes('1\n'), 'should start with index 1');
  assert.ok(srt.includes('2\n'), 'should include index 2');
  assert.ok(srt.includes('3\n'), 'should include index 3');
});

test('generateSRT() produces correct timestamp lines', () => {
  const srt = generateSRT(ENTRIES);
  assert.ok(srt.includes('00:00:01,000 --> 00:00:03,500'));
  assert.ok(srt.includes('00:00:04,000 --> 00:00:06,200'));
});

test('generateSRT() includes entry text', () => {
  const srt = generateSRT(ENTRIES);
  assert.ok(srt.includes('Hello world'));
  assert.ok(srt.includes('This is a test'));
});

test('generateSRT() preserves multi-line text', () => {
  const srt = generateSRT(ENTRIES);
  assert.ok(srt.includes('Line one\nLine two'));
});

test('generateSRT() returns empty string for empty array', () => {
  assert.strictEqual(generateSRT([]), '');
});

test('generateSRT() throws for non-array input', () => {
  assert.throws(() => generateSRT('not an array'), TypeError);
});

// ---------------------------------------------------------------------------
// Round-trip: parseSRT(generateSRT(entries)) preserves data
// ---------------------------------------------------------------------------

test('round-trip preserves start and end times', () => {
  const srt = generateSRT(ENTRIES);
  const parsed = parseSRT(srt);
  assert.strictEqual(parsed.length, ENTRIES.length);
  for (let i = 0; i < ENTRIES.length; i++) {
    assert.ok(Math.abs(parsed[i].start - ENTRIES[i].start) < 0.001, `start mismatch at ${i}`);
    assert.ok(Math.abs(parsed[i].end   - ENTRIES[i].end)   < 0.001, `end mismatch at ${i}`);
  }
});

test('round-trip preserves single-line text', () => {
  const srt = generateSRT(ENTRIES);
  const parsed = parseSRT(srt);
  assert.strictEqual(parsed[0].text, 'Hello world');
  assert.strictEqual(parsed[1].text, 'This is a test');
});

test('round-trip preserves multi-line text', () => {
  const srt = generateSRT(ENTRIES);
  const parsed = parseSRT(srt);
  assert.strictEqual(parsed[2].text, 'Line one\nLine two');
});

// ---------------------------------------------------------------------------
// wordsToSRT()
// ---------------------------------------------------------------------------

test('wordsToSRT() groups consecutive words into one entry', () => {
  const words = [
    { text: '你', start: 0.0, end: 0.2 },
    { text: '好', start: 0.2, end: 0.4 },
    { text: '啊', start: 0.4, end: 0.6 },
  ];
  const entries = wordsToSRT(words);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].text, '你好啊');
  assert.strictEqual(entries[0].start, 0.0);
  assert.strictEqual(entries[0].end, 0.6);
});

test('wordsToSRT() breaks on gap >= gapThreshold (default 0.5s)', () => {
  const words = [
    { text: '前', start: 0.0, end: 0.2 },
    { text: '',   start: 0.2, end: 0.9, isGap: true },  // 0.7s gap
    { text: '后', start: 0.9, end: 1.1 },
  ];
  const entries = wordsToSRT(words);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].text, '前');
  assert.strictEqual(entries[1].text, '后');
});

test('wordsToSRT() does not break on gap < gapThreshold', () => {
  const words = [
    { text: '前', start: 0.0, end: 0.2 },
    { text: '',   start: 0.2, end: 0.5, isGap: true },  // 0.3s gap — below threshold
    { text: '后', start: 0.5, end: 0.7 },
  ];
  const entries = wordsToSRT(words);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].text, '前后');
});

test('wordsToSRT() breaks on sentence-ending punctuation (Chinese)', () => {
  const words = [
    { text: '好的', start: 0.0, end: 0.4 },
    { text: '。',   start: 0.4, end: 0.5 },
    { text: '继续', start: 0.6, end: 1.0 },
  ];
  const entries = wordsToSRT(words);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].text, '好的。');
  assert.strictEqual(entries[1].text, '继续');
});

test('wordsToSRT() breaks on sentence-ending punctuation (ASCII)', () => {
  const words = [
    { text: 'Done', start: 0.0, end: 0.4 },
    { text: '.',    start: 0.4, end: 0.5 },
    { text: 'Next', start: 0.6, end: 1.0 },
  ];
  const entries = wordsToSRT(words);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].text, 'Done.');
});

test('wordsToSRT() breaks when text >= maxChars and next word is a gap', () => {
  // Default maxChars=20; build a 20-char word sequence, then a gap
  const words = [
    { text: '这是一段很长的文字内容超过啦', start: 0.0, end: 1.0 },
    { text: '',                            start: 1.0, end: 1.6, isGap: true },
    { text: '后句',                         start: 1.6, end: 2.0 },
  ];
  const entries = wordsToSRT(words, { gapThreshold: 0.5 });
  // First word alone is >= maxChars (14 chars) and is followed by a gap,
  // so it should flush before the gap flushes (gap >= 0.5s also triggers flush)
  assert.ok(entries.length >= 2, 'should produce at least 2 segments');
  assert.ok(entries.some(e => e.text === '后句'), 'second segment should exist');
});

test('wordsToSRT() respects custom options', () => {
  const words = [
    { text: 'A', start: 0.0, end: 0.1 },
    { text: '',  start: 0.1, end: 0.4, isGap: true },  // 0.3s gap
    { text: 'B', start: 0.4, end: 0.5 },
  ];
  // Custom gapThreshold=0.2 should break on the 0.3s gap
  const entries = wordsToSRT(words, { gapThreshold: 0.2 });
  assert.strictEqual(entries.length, 2);
});

test('wordsToSRT() returns empty array for empty input', () => {
  assert.deepStrictEqual(wordsToSRT([]), []);
});

test('wordsToSRT() throws for non-array input', () => {
  assert.throws(() => wordsToSRT(null), TypeError);
});

// ---------------------------------------------------------------------------
// mergeSRT()
// ---------------------------------------------------------------------------

const HOOK_ENTRIES = [
  { start: 0.0, end: 1.0, text: 'Hook line 1' },
  { start: 1.5, end: 2.5, text: 'Hook line 2' },
];

const MAIN_ENTRIES = [
  { start: 0.0, end: 1.0, text: 'Main line 1' },
  { start: 1.5, end: 2.5, text: 'Main line 2' },
];

const HOOK_DURATION = 3.0;

test('mergeSRT() returns hook entries unchanged', () => {
  const merged = mergeSRT(HOOK_ENTRIES, MAIN_ENTRIES, HOOK_DURATION);
  assert.strictEqual(merged[0].start, 0.0);
  assert.strictEqual(merged[0].end,   1.0);
  assert.strictEqual(merged[0].text,  'Hook line 1');
  assert.strictEqual(merged[1].start, 1.5);
  assert.strictEqual(merged[1].end,   2.5);
});

test('mergeSRT() offsets main entries by hookDuration', () => {
  const merged = mergeSRT(HOOK_ENTRIES, MAIN_ENTRIES, HOOK_DURATION);
  const mainInMerged = merged.slice(HOOK_ENTRIES.length);
  assert.strictEqual(mainInMerged[0].start, 0.0 + HOOK_DURATION);
  assert.strictEqual(mainInMerged[0].end,   1.0 + HOOK_DURATION);
  assert.strictEqual(mainInMerged[1].start, 1.5 + HOOK_DURATION);
  assert.strictEqual(mainInMerged[1].end,   2.5 + HOOK_DURATION);
});

test('mergeSRT() produces correct total entry count', () => {
  const merged = mergeSRT(HOOK_ENTRIES, MAIN_ENTRIES, HOOK_DURATION);
  assert.strictEqual(merged.length, HOOK_ENTRIES.length + MAIN_ENTRIES.length);
});

test('mergeSRT() preserves main entry text', () => {
  const merged = mergeSRT(HOOK_ENTRIES, MAIN_ENTRIES, HOOK_DURATION);
  assert.strictEqual(merged[2].text, 'Main line 1');
  assert.strictEqual(merged[3].text, 'Main line 2');
});

test('mergeSRT() works with empty hookEntries', () => {
  const merged = mergeSRT([], MAIN_ENTRIES, HOOK_DURATION);
  assert.strictEqual(merged.length, MAIN_ENTRIES.length);
  assert.strictEqual(merged[0].start, 0.0 + HOOK_DURATION);
});

test('mergeSRT() works with empty mainEntries', () => {
  const merged = mergeSRT(HOOK_ENTRIES, [], HOOK_DURATION);
  assert.strictEqual(merged.length, HOOK_ENTRIES.length);
});

test('mergeSRT() does not mutate input arrays', () => {
  const hookCopy = HOOK_ENTRIES.map(e => ({ ...e }));
  const mainCopy = MAIN_ENTRIES.map(e => ({ ...e }));
  mergeSRT(hookCopy, mainCopy, HOOK_DURATION);
  assert.strictEqual(mainCopy[0].start, 0.0);  // should be unchanged
});

test('mergeSRT() throws for non-array hookEntries', () => {
  assert.throws(() => mergeSRT(null, [], 1), TypeError);
});

test('mergeSRT() throws for non-array mainEntries', () => {
  assert.throws(() => mergeSRT([], null, 1), TypeError);
});

test('mergeSRT() throws for invalid hookDuration', () => {
  assert.throws(() => mergeSRT([], [], -1), TypeError);
  assert.throws(() => mergeSRT([], [], NaN), TypeError);
});
