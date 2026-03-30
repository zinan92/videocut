#!/usr/bin/env node

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const VALID_CAPABILITIES = [
  'transcribe',
  'autocut',
  'subtitle',
  'hook',
  'clip',
  'cover',
  'speed',
  'pipeline',
];

const HELP_TEXT = `
videocut — AI-powered video editing for spoken-word content

Usage:
  videocut <capability> [input] [-o outputDir] [flags]

Capabilities:
  transcribe   Transcribe audio/video to text using Whisper
  autocut      Auto-cut silences and filler words
  subtitle     Burn subtitles into video
  hook         Generate a hook clip from the first N seconds
  clip         Extract a specific clip by timestamp range
  cover        Generate a cover image from a video frame
  speed        Change playback speed (e.g. --rate 1.5)
  pipeline     Run the full pipeline end-to-end

Examples:
  videocut transcribe input.mp4
  videocut autocut input.mp4 -o ./output
  videocut subtitle input.mp4 --lang zh
  videocut pipeline input.mp4 -o ./output --rate 1.2
  videocut help
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    capability: null,
    input: null,
    outputDir: null,
    options: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      result.outputDir = args[i + 1];
      i += 2;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        result.options[key] = next;
        i += 2;
      } else {
        result.options[key] = true;
        i += 1;
      }
    } else if (result.capability === null) {
      result.capability = arg;
      i += 1;
    } else if (result.input === null) {
      result.input = arg;
      i += 1;
    } else {
      i += 1;
    }
  }

  return result;
}

function buildDefaultOutputDir(inputFile) {
  const today = new Date().toISOString().slice(0, 10);
  const basename = path.basename(inputFile, path.extname(inputFile));
  return path.join('./output', `${today}_${basename}`);
}

function main(argv) {
  const parsed = parseArgs(argv);

  if (!parsed.capability || parsed.capability === 'help') {
    process.stdout.write(HELP_TEXT + '\n');
    return;
  }

  if (!VALID_CAPABILITIES.includes(parsed.capability)) {
    process.stderr.write(`Unknown capability: "${parsed.capability}"\n`);
    process.stderr.write('Run "videocut help" to see available capabilities.\n');
    process.exit(1);
  }

  if (parsed.input && !fs.existsSync(parsed.input)) {
    process.stderr.write(`Input file not found: "${parsed.input}"\n`);
    process.exit(1);
  }

  const outputDir = parsed.outputDir ||
    (parsed.input ? buildDefaultOutputDir(parsed.input) : './output');

  const runOptions = {
    input: parsed.input,
    outputDir,
    options: parsed.options,
  };

  if (parsed.capability === 'pipeline') {
    const pipeline = require('./pipeline');
    pipeline.run(runOptions);
  } else {
    const cap = require(`./capabilities/${parsed.capability}/index`);
    cap.run(runOptions);
  }
}

main(process.argv);
