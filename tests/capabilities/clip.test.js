'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { run, parseChapters, sanitizeFilename } = require('../../capabilities/clip/index.js');

test('clip module exports run, parseChapters, and sanitizeFilename functions', () => {
  assert.strictEqual(typeof run, 'function');
  assert.strictEqual(typeof parseChapters, 'function');
  assert.strictEqual(typeof sanitizeFilename, 'function');
});

test('parseChapters() extracts chapters from AI output', () => {
  const chapters = parseChapters([
    { title: 'Intro', start: '00:00', end: '02:30', summary: 'Introduction' },
    { title: 'Main', start: '02:30', end: '05:00', summary: 'Main point' },
  ]);
  assert.strictEqual(chapters.length, 2);
  assert.strictEqual(chapters[0].startSec, 0);
  assert.strictEqual(chapters[0].endSec, 150);
  assert.strictEqual(chapters[1].startSec, 150);
  assert.strictEqual(chapters[1].endSec, 300);
});

test('parseChapters() handles HH:MM:SS timestamps', () => {
  const chapters = parseChapters([
    { title: 'Long Intro', start: '00:00:00', end: '01:05:30', summary: 'Long intro' },
  ]);
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(chapters[0].startSec, 0);
  assert.strictEqual(chapters[0].endSec, 3930); // 1*3600 + 5*60 + 30
});

test('parseChapters() preserves title, summary, and keywords', () => {
  const chapters = parseChapters([
    {
      title: 'Chapter One',
      start: '00:30',
      end: '03:00',
      summary: 'The first chapter',
      keywords: ['intro', 'overview'],
    },
  ]);
  assert.strictEqual(chapters[0].title, 'Chapter One');
  assert.strictEqual(chapters[0].summary, 'The first chapter');
  assert.deepStrictEqual(chapters[0].keywords, ['intro', 'overview']);
});

test('parseChapters() defaults keywords to empty array when absent', () => {
  const chapters = parseChapters([
    { title: 'No Keywords', start: '00:00', end: '01:00', summary: 'No keywords here' },
  ]);
  assert.deepStrictEqual(chapters[0].keywords, []);
});

test('parseChapters() throws on non-array input', () => {
  assert.throws(
    () => parseChapters('not an array'),
    (err) => {
      assert.ok(err instanceof Error);
      return true;
    }
  );
});

test('sanitizeFilename() removes forbidden characters', () => {
  const result = sanitizeFilename('Hello/World:File*Name?"<>|');
  assert.ok(!result.includes('/'));
  assert.ok(!result.includes(':'));
  assert.ok(!result.includes('*'));
  assert.ok(!result.includes('?'));
  assert.ok(!result.includes('"'));
  assert.ok(!result.includes('<'));
  assert.ok(!result.includes('>'));
  assert.ok(!result.includes('|'));
});

test('sanitizeFilename() replaces spaces with underscores', () => {
  const result = sanitizeFilename('Hello World');
  assert.strictEqual(result, 'Hello_World');
});

test('sanitizeFilename() truncates to maxLen', () => {
  const long = 'a'.repeat(100);
  const result = sanitizeFilename(long, 60);
  assert.strictEqual(result.length, 60);
});

test('sanitizeFilename() uses default maxLen of 60', () => {
  const long = 'a'.repeat(100);
  const result = sanitizeFilename(long);
  assert.strictEqual(result.length, 60);
});

test('run() rejects when input file does not exist', async () => {
  await assert.rejects(
    () => run({ input: '/tmp/nonexistent_clip_input.mp4', outputDir: '/tmp/clip_test_out' }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('/tmp/nonexistent_clip_input.mp4'));
      return true;
    }
  );
});
