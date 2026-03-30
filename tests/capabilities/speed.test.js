'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { clampRate } = require('../../capabilities/speed/index.js');

test('clampRate(1.5) returns 1.2', () => {
  assert.strictEqual(clampRate(1.5), 1.2);
});

test('clampRate(0.8) returns 1.0', () => {
  assert.strictEqual(clampRate(0.8), 1.0);
});

test('clampRate(1.1) returns 1.1', () => {
  assert.strictEqual(clampRate(1.1), 1.1);
});
