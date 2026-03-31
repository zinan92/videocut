'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { extractAudio } = require('../../lib/ffmpeg');
const { wordsToSRT, generateSRT } = require('../../lib/srt');

const whisperScript = path.join(__dirname, 'whisper.sh');
const generateWordsScript = path.join(__dirname, 'generate_words.js');

/**
 * Transcribe a video or audio file using Whisper.
 *
 * @param {object} params
 * @param {string} params.input     - path to input video/audio file
 * @param {string} params.outputDir - directory to write output artifacts
 * @param {object} [params.options]
 * @param {string} [params.options.model] - Whisper model size (default: 'small')
 * @returns {Promise<{words: object[], srt: string, txt: string, artifacts: object}>}
 */
async function run({ input, outputDir, options = {} }) {
  // Validate input exists
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  // Ensure output directory exists and resolve to absolute
  fs.mkdirSync(outputDir, { recursive: true });
  const absOutputDir = path.resolve(outputDir);

  const transcriptPath = path.join(absOutputDir, 'transcript.json');

  // Cache check: if transcript.json already exists, return early
  if (fs.existsSync(transcriptPath)) {
    const words = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
    const txtPath = path.join(absOutputDir, 'transcript.txt');
    const srtPath = path.join(absOutputDir, 'transcript.srt');
    return {
      words,
      srt: srtPath,
      txt: txtPath,
      artifacts: {
        wordsPath: transcriptPath,
        txtPath,
        srtPath,
      },
    };
  }

  // Step 1: Extract audio
  const audioPath = path.join(absOutputDir, 'audio.mp3');
  await extractAudio(input, audioPath);

  // Step 2: Whisper transcribe
  const model = options.model || 'small';
  await execFileAsync('bash', [whisperScript, audioPath, model], { cwd: absOutputDir });

  // Step 3: Rename volcengine_result.json if present (Whisper outputs it directly in cwd)
  const volcengineResult = path.join(absOutputDir, 'volcengine_result.json');

  // Step 4: Generate word-level JSON
  await execFileAsync('node', [generateWordsScript, volcengineResult], { cwd: absOutputDir });

  // Step 5: Rename subtitles_words.json → transcript.json
  const subtitlesWordsPath = path.join(absOutputDir, 'subtitles_words.json');
  fs.renameSync(subtitlesWordsPath, transcriptPath);

  // Step 6: Read words and generate plain text
  const words = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  const plainText = words
    .filter((w) => !w.isGap)
    .map((w) => w.text)
    .join('');

  // Step 7: Write plain text file
  const txtPath = path.join(absOutputDir, 'transcript.txt');
  fs.writeFileSync(txtPath, plainText, 'utf8');

  // Step 8: Generate SRT
  const srtEntries = wordsToSRT(words);
  const srtContent = generateSRT(srtEntries);
  const srtPath = path.join(absOutputDir, 'transcript.srt');
  fs.writeFileSync(srtPath, srtContent, 'utf8');

  return {
    words,
    srt: srtPath,
    txt: txtPath,
    artifacts: {
      wordsPath: transcriptPath,
      txtPath,
      srtPath,
    },
  };
}

module.exports = { run };
