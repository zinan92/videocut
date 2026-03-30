'use strict';

const { execFile } = require('node:child_process');

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

/**
 * Strip markdown code fences and attempt JSON.parse on the result.
 * Returns the parsed value, or null if parsing fails.
 * @param {string} raw - raw string output from Claude
 * @returns {*} parsed JSON value or null
 */
function parseAIOutput(raw) {
  if (typeof raw !== 'string') return null;

  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` code fences
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the Claude CLI with a prompt via stdin, retrying on failure.
 *
 * @param {string} prompt - the prompt text to send via stdin
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - maximum number of attempts
 * @param {Function} [options.parser] - if provided, called with raw output;
 *   retry if it returns null
 * @returns {Promise<string>} raw stdout string (or parsed value if options.parser used)
 */
async function callClaude(prompt, options = {}) {
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : DEFAULT_MAX_RETRIES;
  const parser = options.parser || null;

  const args = [
    '-p',
    '--dangerously-skip-permissions',
    '--output-format',
    'text',
  ];

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let stdout;

    try {
      stdout = await new Promise((resolve, reject) => {
        const child = execFile(CLAUDE_PATH, args, { maxBuffer: 10 * 1024 * 1024 }, (err, out) => {
          if (err) {
            reject(err);
          } else {
            resolve(out);
          }
        });

        // Pass prompt via stdin
        child.stdin.write(prompt);
        child.stdin.end();
      });
    } catch (err) {
      lastError = new Error(`Claude CLI failed (attempt ${attempt}/${maxRetries}): ${err.message}`);
      if (attempt < maxRetries) {
        await sleep(BACKOFF_BASE_MS * Math.pow(3, attempt - 1));
      }
      continue;
    }

    // If a parser is provided, validate the output
    if (parser) {
      const parsed = parser(stdout);
      if (parsed === null) {
        lastError = new Error(`Claude output failed to parse (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await sleep(BACKOFF_BASE_MS * Math.pow(3, attempt - 1));
        }
        continue;
      }
      return parsed;
    }

    return stdout;
  }

  throw lastError || new Error(`Claude CLI failed after ${maxRetries} attempts`);
}

module.exports = { parseAIOutput, callClaude };
