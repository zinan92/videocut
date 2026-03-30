'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = '/tmp/videocut_integration_test';
const FIXTURE_VIDEO = path.join(FIXTURE_DIR, 'test.mp4');

const CLI = path.join(ROOT, 'cli.js');

function runCli(args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (error.code ?? 1) : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('integration', () => {
  before(async () => {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  });

  it('creates test fixture video using ffmpeg.run()', async () => {
    const ffmpeg = require(path.join(ROOT, 'lib/ffmpeg'));
    await ffmpeg.run([
      '-y',
      '-f', 'lavfi', '-i', 'color=black:size=320x240:duration=2',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-t', '2',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      FIXTURE_VIDEO,
    ]);
    assert.ok(fs.existsSync(FIXTURE_VIDEO), `fixture video should exist at ${FIXTURE_VIDEO}`);
  });

  it('CLI help output includes expected capability names', async () => {
    const { stdout, exitCode } = await runCli([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('transcribe'), 'help should include "transcribe"');
    assert.ok(stdout.includes('autocut'), 'help should include "autocut"');
    assert.ok(stdout.includes('hook'), 'help should include "hook"');
    assert.ok(stdout.includes('pipeline'), 'help should include "pipeline"');
  });

  it('speed capability processes test video and produces output file', async () => {
    const speed = require(path.join(ROOT, 'capabilities/speed/index'));
    const outputDir = path.join(FIXTURE_DIR, 'speed_out');
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await speed.run({
      input: FIXTURE_VIDEO,
      outputDir,
      options: { rate: 1.1 },
    });

    assert.ok(result.video, 'result should have a video field');
    assert.ok(fs.existsSync(result.video), `output file should exist at ${result.video}`);
  });

  it('pipeline.parseSteps returns correct array for "autocut,subtitle"', () => {
    const { parseSteps } = require(path.join(ROOT, 'pipeline'));
    const steps = parseSteps('autocut,subtitle');
    assert.deepEqual(steps, ['autocut', 'subtitle']);
  });

  it('directory structure — all capability index.js and SKILL.md files exist', () => {
    const capabilities = ['transcribe', 'autocut', 'subtitle', 'hook', 'clip', 'cover', 'speed'];
    for (const cap of capabilities) {
      const indexPath = path.join(ROOT, 'capabilities', cap, 'index.js');
      const skillPath = path.join(ROOT, 'capabilities', cap, 'SKILL.md');
      assert.ok(
        fs.existsSync(indexPath),
        `capabilities/${cap}/index.js should exist`
      );
      assert.ok(
        fs.existsSync(skillPath),
        `capabilities/${cap}/SKILL.md should exist`
      );
    }
  });

  it('directory structure — lib files exist', () => {
    const libFiles = ['ffmpeg.js', 'srt.js', 'claude.js'];
    for (const f of libFiles) {
      const filePath = path.join(ROOT, 'lib', f);
      assert.ok(fs.existsSync(filePath), `lib/${f} should exist`);
    }
  });

  it('directory structure — root files exist', () => {
    const rootFiles = ['cli.js', 'pipeline.js', 'package.json'];
    for (const f of rootFiles) {
      const filePath = path.join(ROOT, f);
      assert.ok(fs.existsSync(filePath), `${f} should exist`);
    }
  });
});
