'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../../capabilities/cover/index.js');

test('cover module exports run function', () => {
  assert.strictEqual(typeof run, 'function');
});
