'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { callClaude, parseAIOutput } = require('../../lib/claude');

const splitScript = path.join(__dirname, 'split.sh');

/**
 * Parse a timestamp string into seconds.
 * Supports "MM:SS" and "HH:MM:SS" formats.
 *
 * @param {string} ts - timestamp string
 * @returns {number} seconds
 */
function parseTimestamp(ts) {
  const parts = String(ts).split(':').map(Number);
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  throw new Error(`Invalid timestamp format: ${ts}`);
}

/**
 * Parse an array of raw chapter objects from AI output into canonical form.
 *
 * @param {Array<{title: string, start: string, end: string, summary?: string, keywords?: string[]}>} rawArray
 * @returns {Array<{title: string, startSec: number, endSec: number, summary: string, keywords: string[]}>}
 */
function parseChapters(rawArray) {
  if (!Array.isArray(rawArray)) {
    throw new Error('parseChapters: expected an array');
  }
  return rawArray.map((chapter) => ({
    title: chapter.title || '',
    startSec: parseTimestamp(chapter.start),
    endSec: parseTimestamp(chapter.end),
    summary: chapter.summary || '',
    keywords: chapter.keywords || [],
  }));
}

/**
 * Sanitize a string for use as a filename.
 *
 * @param {string} name
 * @param {number} [maxLen=60]
 * @returns {string}
 */
function sanitizeFilename(name, maxLen = 60) {
  const sanitized = name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, maxLen);
  return sanitized;
}

/**
 * Clip a video into chapters using AI-driven chapter detection.
 *
 * @param {object} params
 * @param {string} params.input     - path to input video file
 * @param {string} params.outputDir - directory to write output artifacts
 * @param {object} [params.options]
 * @param {number} [params.options.minDuration] - minimum clip duration in seconds (filter short clips)
 * @param {number} [params.options.maxDuration] - maximum clip duration in seconds (filter long clips)
 * @param {boolean} [params.options.all]        - include all chapters regardless of duration filters
 * @returns {Promise<{clips: string, json: string}>}
 */
async function run({ input, outputDir, options = {} }) {
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Transcribe
  const transcribe = require('../transcribe/index');
  const transcribeResult = await transcribe.run({ input, outputDir, options });

  // Step 2: Read transcript text
  const txtPath = transcribeResult.txt || path.join(outputDir, 'transcript.txt');
  if (!fs.existsSync(txtPath)) {
    throw new Error(`Transcript text file not found: ${txtPath}`);
  }
  const transcriptText = fs.readFileSync(txtPath, 'utf8');

  // Step 3: AI chapter analysis (with fallback to even splits)
  const { probe } = require('../../lib/ffmpeg');
  const videoInfo = await probe(input);
  const totalDuration = videoInfo.duration;

  let chapters;
  try {
    const prompt = `You are a video editor assistant. Given the following transcript, identify chapters with 2-5 minute granularity.

Return ONLY a valid JSON array (no markdown, no explanation) where each element has:
- "title": short descriptive chapter title (string)
- "start": start timestamp in "HH:MM:SS" or "MM:SS" format (string)
- "end": end timestamp in "HH:MM:SS" or "MM:SS" format (string)
- "summary": one-sentence summary of the chapter content (string)
- "keywords": array of 3-5 relevant keywords (array of strings)

Transcript:
${transcriptText}`;

    const rawChapters = await callClaude(prompt, { parser: parseAIOutput });

    if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
      throw new Error('AI returned empty or invalid chapters');
    }

    chapters = parseChapters(rawChapters);
  } catch (aiError) {
    // Fallback: split into even segments of ~120s each
    console.log(`  AI chapter detection failed: ${aiError.message}`);
    console.log('  Falling back to even-interval splitting...');

    const segmentDuration = Math.min(120, totalDuration);
    const segmentCount = Math.max(1, Math.ceil(totalDuration / segmentDuration));
    const actualDuration = totalDuration / segmentCount;

    chapters = [];
    for (let i = 0; i < segmentCount; i++) {
      const startSec = i * actualDuration;
      const endSec = Math.min((i + 1) * actualDuration, totalDuration);
      chapters.push({
        title: `Part ${i + 1}`,
        startSec,
        endSec,
        summary: '',
        keywords: [],
      });
    }
  }

  // Step 5: Apply duration filters (unless --all)
  const filteredChapters = options.all
    ? chapters
    : chapters.filter((ch) => {
        const duration = ch.endSec - ch.startSec;
        if (options.minDuration !== undefined && duration < options.minDuration) return false;
        if (options.maxDuration !== undefined && duration > options.maxDuration) return false;
        return true;
      });

  // Step 6: Write chapters.json
  const chaptersJsonPath = path.join(outputDir, 'chapters.json');
  fs.writeFileSync(chaptersJsonPath, JSON.stringify(filteredChapters, null, 2), 'utf8');

  // Step 7: FFmpeg cut each chapter
  const clipsDir = path.join(outputDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });

  const clipResults = await Promise.all(
    filteredChapters.map(async (chapter, idx) => {
      const safeName = sanitizeFilename(chapter.title) || `chapter_${idx + 1}`;
      const outputFile = path.join(clipsDir, `${String(idx + 1).padStart(2, '0')}_${safeName}.mp4`);
      await execFileAsync('bash', [
        splitScript,
        input,
        String(chapter.startSec),
        String(chapter.endSec),
        outputFile,
      ]);
      return { ...chapter, file: outputFile };
    })
  );

  // Update chapters.json with file paths
  fs.writeFileSync(chaptersJsonPath, JSON.stringify(clipResults, null, 2), 'utf8');

  return {
    clips: clipsDir,
    json: chaptersJsonPath,
  };
}

module.exports = { run, parseChapters, sanitizeFilename };
