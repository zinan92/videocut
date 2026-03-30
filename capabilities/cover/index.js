'use strict';

// capabilities/cover/index.js — Generate thumbnail quote cards from hook quotes

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const MAX_QUOTES = 5;

/**
 * Run the cover capability: generate PNG quote cards from hook quotes.
 *
 * Quote source priority:
 *   1. options.text  → single manual quote
 *   2. options.quotes → path to a JSON file
 *   3. Default: hooks.json in outputDir
 *
 * @param {object} params
 * @param {string} params.input - path to source video (unused by cover, kept for interface consistency)
 * @param {string} params.outputDir - directory for card outputs
 * @param {object} [params.options]
 * @param {string} [params.options.text]   - manual quote text (single card)
 * @param {string} [params.options.quotes] - path to quotes JSON file
 * @returns {Promise<{ artifacts: { cards: string[] } }>}
 */
async function run({ input, outputDir, options = {} }) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Resolve quotes from source
  let quotes;

  if (options.text) {
    quotes = [{ quote_text: options.text, hook_score: 10 }];
  } else if (options.quotes) {
    const raw = fs.readFileSync(options.quotes, 'utf8');
    quotes = JSON.parse(raw);
  } else {
    const defaultPath = path.join(outputDir, 'hooks.json');
    if (!fs.existsSync(defaultPath)) {
      throw new Error(
        'No quotes found. Provide --quotes <file> or --text "金句" or run the hook capability first.'
      );
    }
    const raw = fs.readFileSync(defaultPath, 'utf8');
    quotes = JSON.parse(raw);
  }

  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new Error(
      'No quotes found. Provide --quotes <file> or --text "金句" or run the hook capability first.'
    );
  }

  // Step 2: Limit to MAX_QUOTES
  const limited = quotes.slice(0, MAX_QUOTES);

  // Step 3: Write temp quotes JSON to outputDir
  const tmpQuotesPath = path.join(outputDir, '_cover_quotes_tmp.json');
  fs.writeFileSync(tmpQuotesPath, JSON.stringify(limited, null, 2), 'utf8');

  // Step 4: Shell out to generate.sh
  const generateScript = path.join(__dirname, 'generate.sh');

  try {
    await execFileAsync('bash', [generateScript, tmpQuotesPath, outputDir], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    // Step 5: Clean up temp file
    try { fs.unlinkSync(tmpQuotesPath); } catch (_) {}
  }

  // Step 6: Collect card paths
  const cardPaths = limited.map((_, i) => path.join(outputDir, `4_card_${i + 1}.png`));

  return {
    artifacts: {
      cards: cardPaths,
    },
  };
}

module.exports = { run };
