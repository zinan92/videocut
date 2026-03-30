'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseSteps } = require('../pipeline.js');

test('parseSteps returns array for valid comma-separated steps', () => {
  const result = parseSteps('autocut,subtitle,hook');
  assert.deepEqual(result, ['autocut', 'subtitle', 'hook']);
});

test('parseSteps throws for unknown capability', () => {
  assert.throws(
    () => parseSteps('autocut,bogus'),
    /Unknown capability: bogus/
  );
});
