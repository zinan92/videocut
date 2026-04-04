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

async function main(argv) {
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

  // Batch mode: if input is a directory, run the capability on each video file
  if (parsed.input && fs.existsSync(parsed.input) && fs.statSync(parsed.input).isDirectory()) {
    const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.m4v']);
    const files = fs.readdirSync(parsed.input)
      .filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(parsed.input, f))
      .sort();

    if (files.length === 0) {
      process.stderr.write(`No video files found in: "${parsed.input}"\n`);
      process.exit(1);
    }

    process.stdout.write(`Found ${files.length} video(s) in ${parsed.input}\n\n`);

    const cap = parsed.capability === 'pipeline'
      ? require('./pipeline')
      : require(`./capabilities/${parsed.capability}/index`);

    (async () => {
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const outputDir = parsed.outputDir
          ? path.join(parsed.outputDir, path.basename(file, path.extname(file)))
          : buildDefaultOutputDir(file);
        process.stdout.write(`[${i + 1}/${files.length}] ${path.basename(file)}\n`);
        try {
          await cap.run({ input: file, outputDir, options: parsed.options });
          ok++;
        } catch (err) {
          process.stderr.write(`  Error: ${err.message}\n`);
          fail++;
        }
      }
      process.stdout.write(`\nDone: ${ok} succeeded, ${fail} failed\n`);
      if (fail > 0) process.exit(1);
    })();
    return;
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
    await pipeline.run(runOptions);
  } else {
    const cap = require(`./capabilities/${parsed.capability}/index`);
    await cap.run(runOptions);
  }
}

main(process.argv).catch((err) => {
  const message = err && err.stdout ? String(err.stdout).trim()
    : err && err.stderr ? String(err.stderr).trim()
    : err && err.message ? String(err.message).trim()
    : 'Unknown error';
  process.stderr.write(message + '\n');
  process.exit(1);
});
