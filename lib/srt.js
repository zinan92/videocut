'use strict';

/**
 * lib/srt.js — SRT subtitle parse, generate, and merge utilities
 *
 * Exports:
 *   formatTime(seconds)              — seconds → "HH:MM:SS,mmm"
 *   parseSRT(text)                   — SRT text → [{start, end, text}]
 *   generateSRT(entries)             — [{start, end, text}] → SRT text
 *   wordsToSRT(words, options)       — word-level JSON → subtitle entries
 *   mergeSRT(hookEntries, mainEntries, hookDuration) — hook+main merge
 *
 * Zero npm dependencies — only Node.js built-ins.
 */

// Sentence-ending punctuation (CJK + ASCII)
const SENTENCE_ENDS = /[。！？.!?]/;

/**
 * Convert seconds to SRT timestamp format HH:MM:SS,mmm.
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) {
    throw new TypeError(`formatTime: expected non-negative finite number, got ${seconds}`);
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}

/**
 * Parse SRT text into an array of subtitle entries.
 * Handles both comma and dot as millisecond separator.
 * @param {string} text — raw SRT content
 * @returns {{start: number, end: number, text: string}[]}
 */
function parseSRT(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseSRT: expected a string');
  }
  const entries = [];
  const blocks = text.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const tm = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!tm) continue;
    const start = +tm[1] * 3600 + +tm[2] * 60 + +tm[3] + +tm[4] / 1000;
    const end   = +tm[5] * 3600 + +tm[6] * 60 + +tm[7] + +tm[8] / 1000;
    entries.push({ start, end, text: lines.slice(2).join('\n') });
  }
  return entries;
}

/**
 * Generate SRT text from an array of subtitle entries.
 * @param {{start: number, end: number, text: string}[]} entries
 * @returns {string}
 */
function generateSRT(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('generateSRT: expected an array of entries');
  }
  return entries
    .map((entry, i) => {
      if (typeof entry.start !== 'number' || typeof entry.end !== 'number') {
        throw new TypeError(`generateSRT: entry ${i} missing start/end numbers`);
      }
      return `${i + 1}\n${formatTime(entry.start)} --> ${formatTime(entry.end)}\n${entry.text}\n`;
    })
    .join('\n');
}

/**
 * Group word-level JSON entries into subtitle entries.
 *
 * Words format: [{text, start, end, isGap?}, ...]
 * A word with isGap=true represents silence.
 *
 * Break rules (in priority order):
 *   1. Gap duration >= gapThreshold → flush current segment
 *   2. After sentence-ending punctuation (。！？.!?) → flush
 *   3. Current text reached maxChars and next word is a gap → flush
 *
 * @param {{text: string, start: number, end: number, isGap?: boolean}[]} words
 * @param {{maxChars?: number, gapThreshold?: number}} [options]
 * @returns {{start: number, end: number, text: string}[]}
 */
function wordsToSRT(words, options = {}) {
  if (!Array.isArray(words)) {
    throw new TypeError('wordsToSRT: expected an array of words');
  }

  const maxChars = options.maxChars != null ? options.maxChars : 20;
  const gapThreshold = options.gapThreshold != null ? options.gapThreshold : 0.5;

  const entries = [];
  let currentText = '';
  let currentStart = -1;
  let currentEnd = -1;

  const flush = () => {
    if (currentText.length > 0) {
      entries.push({ start: currentStart, end: currentEnd, text: currentText });
      currentText = '';
      currentStart = -1;
      currentEnd = -1;
    }
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (w.isGap) {
      const gapDuration = w.end - w.start;
      if (gapDuration >= gapThreshold) {
        flush();
      }
      continue;
    }

    // Accumulate non-gap word
    if (currentStart < 0) currentStart = w.start;
    currentText += w.text;
    currentEnd = w.end;

    // Break on sentence-ending punctuation
    if (SENTENCE_ENDS.test(w.text)) {
      flush();
      continue;
    }

    // Break at maxChars when next token is a gap (or end of input)
    if (currentText.length >= maxChars) {
      const next = words[i + 1];
      if (!next || next.isGap) {
        flush();
      }
    }
  }

  // Flush any remaining segment
  flush();

  return entries;
}

/**
 * Merge hook SRT entries and main SRT entries for hook+main video.
 * Hook entries are kept as-is; main entries are offset by hookDuration.
 *
 * @param {{start: number, end: number, text: string}[]} hookEntries
 * @param {{start: number, end: number, text: string}[]} mainEntries
 * @param {number} hookDuration — duration of the hook clip in seconds
 * @returns {{start: number, end: number, text: string}[]}
 */
function mergeSRT(hookEntries, mainEntries, hookDuration) {
  if (!Array.isArray(hookEntries)) {
    throw new TypeError('mergeSRT: hookEntries must be an array');
  }
  if (!Array.isArray(mainEntries)) {
    throw new TypeError('mergeSRT: mainEntries must be an array');
  }
  if (typeof hookDuration !== 'number' || !isFinite(hookDuration) || hookDuration < 0) {
    throw new TypeError('mergeSRT: hookDuration must be a non-negative finite number');
  }

  const offsetMain = mainEntries.map((e) => ({
    start: e.start + hookDuration,
    end: e.end + hookDuration,
    text: e.text,
  }));

  return [...hookEntries, ...offsetMain];
}

module.exports = { formatTime, parseSRT, generateSRT, wordsToSRT, mergeSRT };
