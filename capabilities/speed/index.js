'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { probe } = require('../../lib/ffmpeg');

const MIN_RATE = 1.0;
const MAX_RATE = 1.2;
const DEFAULT_RATE = 1.1;

const adjustScript = path.join(__dirname, 'adjust.sh');

/**
 * Clamp a speed rate to the allowed range [1.0, 1.2].
 * @param {number} rate
 * @returns {number}
 */
function clampRate(rate) {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/**
 * Run speed adjustment on a video file.
 * @param {object} params
 * @param {string} params.input - path to input video
 * @param {string} params.outputDir - directory to write output
 * @param {object} [params.options]
 * @param {number} [params.options.rate] - speed rate (clamped to [1.0, 1.2])
 * @returns {Promise<{video: string, artifacts: {}}>}
 */
async function run({ input, outputDir, options = {} }) {
  const rawRate = options.rate != null ? options.rate : DEFAULT_RATE;
  const rate = clampRate(rawRate);

  const info = await probe(input);
  console.log(
    `[speed] ${path.basename(input)} duration=${info.duration.toFixed(2)}s — applying ${rate}x speed`
  );

  const outputPath = path.join(outputDir, 'speed.mp4');

  await execFileAsync('bash', [adjustScript, input, String(rate), outputPath]);

  return { video: outputPath, artifacts: {} };
}

module.exports = { clampRate, run };
