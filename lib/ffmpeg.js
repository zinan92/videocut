'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

/**
 * Execute FFmpeg with the given args.
 * @param {string[]} args - FFmpeg CLI arguments
 * @param {object} [opts] - options passed to execFile
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function run(args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(FFMPEG_PATH, args, opts);
    return { stdout, stderr };
  } catch (err) {
    // FFmpeg writes errors to stderr; surface that as the error message
    const message = err.stderr ? err.stderr.trim() : err.message;
    const error = new Error(message);
    error.code = err.code;
    error.stderr = err.stderr;
    error.stdout = err.stdout;
    throw error;
  }
}

/**
 * Probe a media file and return basic metadata.
 * @param {string} filePath - path to the media file
 * @returns {Promise<{duration: number, width: number|null, height: number|null, bitrate: number|null}>}
 */
async function probe(filePath) {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    `file:${filePath}`,
  ];

  let stdout;
  try {
    ({ stdout } = await execFileAsync(FFPROBE_PATH, args));
  } catch (err) {
    const message = err.stderr ? err.stderr.trim() : err.message;
    const error = new Error(message);
    error.code = err.code;
    throw error;
  }

  const data = JSON.parse(stdout);

  const format = data.format || {};
  const duration = parseFloat(format.duration) || 0;
  const bitrate = format.bit_rate ? parseInt(format.bit_rate, 10) : null;

  const videoStream = (data.streams || []).find(
    (s) => s.codec_type === 'video'
  );
  const width = videoStream ? (videoStream.width || null) : null;
  const height = videoStream ? (videoStream.height || null) : null;

  return { duration, width, height, bitrate };
}

/**
 * Extract audio track from a video file to MP3.
 * @param {string} videoPath - input video file
 * @param {string} audioPath - output MP3 file
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function extractAudio(videoPath, audioPath) {
  const args = [
    '-y',
    '-i', `file:${videoPath}`,
    '-vn',
    '-acodec', 'libmp3lame',
    '-q:a', '2',
    `file:${audioPath}`,
  ];

  return run(args);
}

module.exports = { run, probe, extractAudio };
