'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAIOutput } = require('../../lib/claude.js');

// ---------------------------------------------------------------------------
// parseAIOutput()
// ---------------------------------------------------------------------------

test('parseAIOutput() extracts JSON array from clean output', () => {
  const result = parseAIOutput('[1, 2, 3]');
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('parseAIOutput() strips code fences and parses JSON array', () => {
  const result = parseAIOutput('```json\n[1, 2, 3]\n```');
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('parseAIOutput() returns null on non-JSON garbage', () => {
  const result = parseAIOutput('this is not json at all!!!');
  assert.strictEqual(result, null);
});
