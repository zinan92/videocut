'use strict';

// capabilities/hook/match.js — 金句 → SRT 时间戳匹配
// Refactored from lib/hook-segments.js v6

/**
 * Parse SRT content into an array of { start, end, text } entries.
 * @param {string} text - raw SRT file content
 * @returns {{ start: number, end: number, text: string }[]}
 */
function parseSRT(text) {
  const entries = [];
  const blocks = text.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const tm = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!tm) continue;
    entries.push({
      start: tsToSec(tm[1]),
      end: tsToSec(tm[2]),
      text: lines.slice(2).join(' ').trim(),
    });
  }
  return entries;
}

/**
 * Convert SRT timestamp string to seconds.
 * @param {string} ts - e.g. "00:01:23,456"
 * @returns {number}
 */
function tsToSec(ts) {
  const normalized = ts.replace(',', '.');
  const parts = normalized.split(':');
  return (parseInt(parts[0]) || 0) * 3600
       + (parseInt(parts[1]) || 0) * 60
       + (parseFloat(parts[2]) || 0);
}

/**
 * Format seconds as m:ss.s string for display.
 * @param {number} sec
 * @returns {string}
 */
function secToTs(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

/**
 * Match quotes to SRT timestamps and return filtered, expanded segments.
 *
 * @param {object[]} quotes - array of quote objects with original_text, quote_text, hook_score, category
 * @param {string} srtContent - raw SRT file content
 * @param {object} [options]
 * @param {number} [options.maxCount=4] - maximum number of hook segments to return
 * @param {number} [options.maxDuration=10] - skip segments longer than this (seconds)
 * @param {boolean} [options.strictMode=false] - preserve input order, skip auto-filtering
 * @returns {{ segments: object[], hookCount: number, totalDuration: number }}
 */
function matchHooksToSRT(quotes, srtContent, options = {}) {
  const maxCount = options.maxCount !== undefined ? options.maxCount : 4;
  const maxDuration = options.maxDuration !== undefined ? options.maxDuration : 10;
  const strictMode = options.strictMode || false;

  const srt = parseSRT(srtContent);

  // Calculate average speech speed (chars/sec)
  let totalChars = 0;
  let totalDur = 0;
  srt.forEach((e) => {
    totalChars += e.text.length;
    totalDur += (e.end - e.start);
  });
  const avgSpeed = totalDur > 0 ? totalChars / totalDur : 0;

  // Build full text and char-to-entry index for matching
  const clean = (c) => c.replace(/[\s,.\u3001\u3002\uff01\uff1f\uff0c\uff1b\uff1a\u201c\u201d\u2018\u2019\n]/g, '');

  let fullText = '';
  const charToEntry = [];

  srt.forEach((entry, idx) => {
    const cleaned = clean(entry.text);
    for (let i = 0; i < cleaned.length; i++) {
      fullText += cleaned[i];
      charToEntry.push(idx);
    }
  });

  /**
   * Find the SRT entry range that covers originalText.
   * Falls back to longest-common-prefix fuzzy match if exact fails.
   */
  function matchTextInSRT(originalText) {
    const needle = clean(originalText);
    const pos = fullText.indexOf(needle);

    if (pos === -1) {
      // Fuzzy: find longest common prefix starting at each position
      let bestPos = -1;
      let bestLen = 0;
      for (let i = 0; i < fullText.length; i++) {
        let len = 0;
        while (
          i + len < fullText.length
          && len < needle.length
          && fullText[i + len] === needle[len]
        ) len++;
        if (len > bestLen) {
          bestLen = len;
          bestPos = i;
        }
      }
      if (bestLen >= needle.length * 0.5) {
        const startIdx = charToEntry[bestPos];
        const endIdx = charToEntry[Math.min(bestPos + bestLen - 1, charToEntry.length - 1)];
        return { startIdx, endIdx, confidence: bestLen / needle.length };
      }
      return null;
    }

    const startIdx = charToEntry[pos];
    const endIdx = charToEntry[pos + needle.length - 1];
    return { startIdx, endIdx, confidence: 1.0 };
  }

  // Sort by hook_score descending unless strict mode
  const sorted = strictMode
    ? quotes
    : quotes.slice().sort((a, b) => b.hook_score - a.hook_score);

  const segments = [];
  let strictFailures = 0;

  for (const q of sorted) {
    const text = q.original_text || q.quote_text || q.quote;
    const match = matchTextInSRT(text);

    if (!match) {
      strictFailures++;
      continue;
    }

    const start = srt[match.startIdx].start;
    const end = srt[match.endIdx].end;
    const duration = end - start;
    const charCount = text.replace(/\s/g, '').length;
    const speed = duration > 0 ? charCount / duration : 0;

    if (!strictMode) {
      // Filter by maxDuration
      if (duration > maxDuration) continue;

      // Filter by speech speed
      if (speed < avgSpeed * 0.8) continue;

      // Filter overlapping segments
      let overlap = false;
      for (const existing of segments) {
        const oStart = Math.max(start, existing.start);
        const oEnd = Math.min(end, existing.end);
        if (oEnd - oStart > 0) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
    }

    const seg = {
      index: segments.length + 1,
      quote_text: q.quote_text || text,
      original_text: text,
      hook_score: q.hook_score,
      category: q.category || 'controversial',
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      duration: Math.round(duration * 1000) / 1000,
      word_count: charCount,
      speed: Math.round(speed * 100) / 100,
    };

    segments.push(seg);

    // Auto-expand segments shorter than 3s
    if (seg.duration < 3) {
      let newEndIdx = match.endIdx;
      let newEnd = seg.end;
      // Expand forward first
      while (newEnd - seg.start < 3 && newEndIdx + 1 < srt.length) {
        newEndIdx++;
        newEnd = srt[newEndIdx].end;
      }
      // Expand backward if still short
      let newStartIdx = match.startIdx;
      let newStart = seg.start;
      while (newEnd - newStart < 3 && newStartIdx > 0) {
        newStartIdx--;
        newStart = srt[newStartIdx].start;
      }

      seg.start = Math.round(newStart * 1000) / 1000;
      seg.end = Math.round(newEnd * 1000) / 1000;
      seg.duration = Math.round((newEnd - newStart) * 1000) / 1000;
    }

    if (!strictMode && segments.length >= maxCount) break;
  }

  if (strictMode && (strictFailures > 0 || segments.length !== sorted.length)) {
    throw new Error(
      `STRICT mode failed: expected ${sorted.length} segments, got ${segments.length} (${strictFailures} match failures)`
    );
  }

  // Suspense cut on last segment: trim 0.5s from end if > 3s
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    last.is_last = true;
    if (last.duration > 3) {
      last.suspense_cut = true;
      last.end = Math.round((last.end - 0.5) * 1000) / 1000;
      last.duration = Math.round((last.end - last.start) * 1000) / 1000;
    }
  }

  const totalDuration = segments.reduce((s, x) => s + x.duration, 0);

  return {
    segments,
    hookCount: segments.length,
    totalDuration: Math.round(totalDuration * 10) / 10,
  };
}

module.exports = { matchHooksToSRT, parseSRT };
