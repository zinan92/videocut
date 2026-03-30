'use strict';

const path = require('node:path');
const fs = require('node:fs');

const VALID_STEPS = ['transcribe', 'autocut', 'subtitle', 'hook', 'clip', 'cover', 'speed'];

/**
 * Parse a comma-separated steps string into an array of validated step names.
 *
 * @param {string} stepsStr - comma-separated step names
 * @returns {string[]} array of validated step names
 * @throws {Error} if any step is not in VALID_STEPS
 */
function parseSteps(stepsStr) {
  const steps = stepsStr.split(',').map((s) => s.trim()).filter(Boolean);

  for (const step of steps) {
    if (!VALID_STEPS.includes(step)) {
      throw new Error(`Unknown capability: ${step}`);
    }
  }

  return steps;
}

/**
 * Run the pipeline: chain capabilities sequentially.
 *
 * @param {object} params
 * @param {string} params.input     - path to input video
 * @param {string} params.outputDir - directory to write output artifacts
 * @param {object} [params.options]
 * @param {string} params.options.steps - comma-separated list of steps
 * @returns {Promise<void>}
 */
async function run({ input, outputDir, options = {} }) {
  if (!options.steps) {
    throw new Error('No steps specified. Provide options.steps as a comma-separated list.');
  }

  const steps = parseSteps(options.steps);

  if (steps.length === 0) {
    throw new Error('No steps specified. Provide options.steps as a comma-separated list.');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Pipeline steps: ${steps.join(' → ')}`);
  console.log(`Output dir: ${outputDir}`);

  let currentInput = input;
  const total = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`[${i + 1}/${total}] ${step}`);

    const capability = require(`./capabilities/${step}/index`);
    const result = await capability.run({ input: currentInput, outputDir, options });

    if (result && result.video) {
      currentInput = result.video;
    }
  }

  console.log('Pipeline complete.');
}

module.exports = { run, parseSteps, VALID_STEPS };
