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
const mlxScript = path.join(__dirname, 'mlx_transcribe.py');

const MLX_MODEL_REPOS = {
  tiny: 'mlx-community/whisper-tiny-mlx',
  base: 'mlx-community/whisper-base-mlx',
  small: 'mlx-community/whisper-small-mlx',
  medium: 'mlx-community/whisper-medium-mlx',
  large: 'mlx-community/whisper-large-v3',
  turbo: 'mlx-community/whisper-large-v3-turbo',
};

function resolveBackend(options = {}, system = process) {
  const requested = options.backend ? String(options.backend).toLowerCase() : '';

  if (requested) {
    if (!['mlx', 'whisper'].includes(requested)) {
      throw new Error(`Unsupported transcription backend: ${requested}`);
    }
    return requested;
  }

  if (system.platform === 'darwin' && system.arch === 'arm64') {
    return 'mlx';
  }

  return 'whisper';
}

function resolveDevice(options = {}, system = process) {
  const requested = options.device ? String(options.device).toLowerCase() : '';

  if (requested === 'cpu') {
    throw new Error('CPU transcription is disabled. Please use Apple Silicon acceleration instead.');
  }

  if (requested) {
    return requested;
  }

  if (system.platform === 'darwin' && system.arch === 'arm64') {
    return 'mps';
  }

  throw new Error(
    'No supported accelerated transcription device is available. CPU fallback is disabled.'
  );
}

function resolveMlxPython(env = process.env, exists = fs.existsSync, options = {}) {
  const envPython = env.MLX_WHISPER_PYTHON;
  if (envPython && exists(envPython)) {
    return envPython;
  }

  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..');
  const candidates = [
    path.join(repoRoot, '.venv-mlx-whisper', 'bin', 'python3'),
    path.join(repoRoot, '.venv-mlx-whisper', 'bin', 'python'),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'mlx-whisper runtime is not installed. Set MLX_WHISPER_PYTHON or create .venv-mlx-whisper in the videocut repo.'
  );
}

function resolveMlxModel(model = 'small') {
  if (!model) return MLX_MODEL_REPOS.small;
  if (String(model).includes('/')) return String(model);
  return MLX_MODEL_REPOS[model] || model;
}

function ms(seconds) {
  return Math.round((Number(seconds) || 0) * 1000);
}

function convertMlxResult(result) {
  const segments = Array.isArray(result && result.segments) ? result.segments : [];
  return {
    utterances: segments.map((segment) => ({
      text: segment.text || '',
      start_time: ms(segment.start),
      end_time: ms(segment.end),
      words: Array.isArray(segment.words)
        ? segment.words.map((word) => ({
            text: word.word || '',
            start_time: ms(word.start),
            end_time: ms(word.end),
          }))
        : [],
    })),
  };
}

async function runWhisperBackend({ audioPath, outputDir, options }) {
  const model = options.model || 'small';
  const device = resolveDevice(options);
  await execFileAsync('bash', [whisperScript, audioPath, model, device], { cwd: outputDir });
}

async function runMlxBackend({ audioPath, outputDir, options }) {
  const mlxPython = resolveMlxPython();
  const modelRepo = resolveMlxModel(options.model || 'small');
  const rawResultPath = path.join(outputDir, 'mlx_result.json');

  await execFileAsync(mlxPython, [mlxScript, audioPath, modelRepo, rawResultPath], {
    cwd: outputDir,
  });

  const raw = JSON.parse(fs.readFileSync(rawResultPath, 'utf8'));
  const converted = convertMlxResult(raw);
  fs.writeFileSync(
    path.join(outputDir, 'volcengine_result.json'),
    JSON.stringify(converted, null, 2) + '\n',
    'utf8'
  );
}

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

  // Step 2: Transcribe via the selected backend
  const backend = resolveBackend(options);
  if (backend === 'mlx') {
    await runMlxBackend({ audioPath, outputDir: absOutputDir, options });
  } else {
    await runWhisperBackend({ audioPath, outputDir: absOutputDir, options });
  }

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

module.exports = {
  run,
  convertMlxResult,
  resolveBackend,
  resolveDevice,
  resolveMlxModel,
  resolveMlxPython,
};
