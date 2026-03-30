'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { wordsToSRT, generateSRT } = require('../../lib/srt');

const detectScript = path.join(__dirname, 'detect.js');
const burnScript = path.join(__dirname, 'burn.sh');

/**
 * Add burned-in subtitles to a video.
 *
 * Flow:
 *   1. Check input exists
 *   2. Detect hardcoded subtitles — skip if already present
 *   3. Transcribe input video to get word-level timing
 *   4. Generate SRT from words
 *   5. If --no-burn, return early with SRT only
 *   6. Burn subtitles into video via burn.sh
 *
 * Design: Always transcribes the input video directly — no time offset needed.
 * After autocut, pass the cut video here for fresh subtitles.
 *
 * @param {object} params
 * @param {string} params.input     - path to input video file
 * @param {string} params.outputDir - directory to write output artifacts
 * @param {object} [params.options]
 * @param {boolean} [params.options['no-burn']] - skip burning, return SRT only
 * @returns {Promise<{video: string, srt?: string, artifacts?: object}>}
 */
async function run({ input, outputDir, options = {} }) {
  // Step 1: Check input exists
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Step 2: Detect hardcoded subtitles
  let detectOutput = '';
  try {
    const result = await execFileAsync('node', [detectScript, input]);
    detectOutput = result.stdout.trim();
  } catch (err) {
    // detect script exits with non-zero when no subtitles found — check stdout
    detectOutput = (err.stdout || '').trim();
  }

  if (detectOutput === 'true') {
    // Already has hardcoded subtitles — skip processing
    return { video: input };
  }

  // Step 3: Transcribe input video
  const transcribe = require('../transcribe/index');
  const { words } = await transcribe.run({ input, outputDir, options });

  // Step 4: Generate SRT from words
  const entries = wordsToSRT(words);
  const srtContent = generateSRT(entries);
  const srtPath = path.join(outputDir, 'subtitle.srt');
  fs.writeFileSync(srtPath, srtContent, 'utf8');

  // Step 5: If no-burn, return early with SRT only
  if (options['no-burn']) {
    return { video: input, srt: srtPath, artifacts: { srtPath } };
  }

  // Step 6: Burn subtitles into video
  const inputBasename = path.basename(input, path.extname(input));
  const outputVideo = path.join(outputDir, `${inputBasename}_subtitled.mp4`);

  await execFileAsync('bash', [burnScript, input, srtPath, outputVideo]);

  return {
    video: outputVideo,
    srt: srtPath,
    artifacts: { srtPath },
  };
}

module.exports = { run };
