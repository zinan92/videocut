'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '../cli.js');

function runCli(args) {
  return new Promise((resolve) => {
    execFile('node', [CLI, ...args], (error, stdout, stderr) => {
      resolve({
        exitCode: error ? error.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('cli', () => {
  it('shows help when no args given', async () => {
    const { stdout, exitCode } = await runCli([]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('videocut'), 'stdout should include "videocut"');
    assert.ok(stdout.includes('transcribe'), 'stdout should include "transcribe"');
    assert.ok(stdout.includes('autocut'), 'stdout should include "autocut"');
  });

  it('shows help when "help" is the capability', async () => {
    const { stdout, exitCode } = await runCli(['help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('videocut'), 'stdout should include "videocut"');
    assert.ok(stdout.includes('transcribe'), 'stdout should include "transcribe"');
  });

  it('errors on unknown capability with exit code 1', async () => {
    const { exitCode, stderr } = await runCli(['bogus']);
    assert.equal(exitCode, 1);
    assert.ok(
      stderr.includes('Unknown capability') && stderr.includes('bogus'),
      `stderr should include 'Unknown capability: "bogus"', got: ${stderr}`
    );
  });

  it('errors on missing input file with exit code 1', async () => {
    const { exitCode, stderr } = await runCli(['transcribe', '/nonexistent/file.mp4']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('not found'), `stderr should mention file not found, got: ${stderr}`);
  });
});
