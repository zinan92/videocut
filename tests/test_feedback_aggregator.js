const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const SCRIPT = path.join(__dirname, '..', '剪口播', 'scripts', 'feedback_aggregator.js');
// The aggregator always writes to this path (relative to its __dirname)
const OUT_FILE = path.join(__dirname, '..', '剪口播', '用户习惯', 'feedback_examples.md');

function setupAndRun(feedbackFiles, maxExamples = 20) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-test-'));
  const outputDir = path.join(tmpDir, 'output');

  // Create mock output directories with feedback files
  for (const [dirName, data] of Object.entries(feedbackFiles)) {
    const dir = path.join(outputDir, dirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '3_feedback.json'), JSON.stringify(data));
  }

  try {
    const result = execFileSync(process.execPath, [SCRIPT, outputDir, String(maxExamples)], {
      stdio: 'pipe',
      cwd: path.join(__dirname, '..'),
    });
    const content = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { stdout: result.toString(), content };
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { stdout: e.stdout?.toString() || '', error: e.message };
  }
}

// Test 1: Empty output directory
console.log('Test 1: Empty/nonexistent output dir...');
const r1 = execFileSync(process.execPath, [SCRIPT, '/nonexistent'], { stdio: 'pipe' }).toString();
assert(r1.includes('No user-reviewed feedback'), 'Should handle missing dir gracefully');
console.log('  ✅ Pass');

// Test 2: Only no-server feedback (should be filtered out)
console.log('Test 2: Only no-server mode...');
const r2 = setupAndRun({
  '2026-03-19_test': {
    timestamp: '2026-03-19T10:00:00Z',
    mode: 'no-server',
    ai_selected_count: 5,
    user_selected_count: 5,
    ai_over_deleted: [],
    ai_under_deleted: [],
  }
});
assert(r2.stdout.includes('No user-reviewed feedback'), 'Should skip no-server feedback');
console.log('  ✅ Pass');

// Test 3: Real feedback with corrections
console.log('Test 3: Real feedback with corrections...');
const r3 = setupAndRun({
  '2026-03-19_video1': {
    timestamp: '2026-03-19T10:00:00Z',
    ai_selected_count: 10,
    user_selected_count: 8,
    ai_over_deleted: [
      { idx: 5, text: '然后', time: '1.00-1.20' },
      { idx: 8, text: '其实', time: '2.00-2.30' },
    ],
    ai_under_deleted: [
      { idx: 12, text: '嗯嗯嗯', time: '3.00-3.50' },
    ],
  }
});
assert(r3.content !== null, 'Should generate output file');
assert(r3.content.includes('然后'), 'Should include over-deleted text');
assert(r3.content.includes('嗯嗯嗯'), 'Should include under-deleted text');
assert(r3.content.includes('AI 误删'), 'Should have over-deleted section');
assert(r3.content.includes('AI 漏删'), 'Should have under-deleted section');
console.log('  ✅ Pass');

// Test 4: Gap items should be filtered
console.log('Test 4: Gap items filtered...');
const r4 = setupAndRun({
  '2026-03-19_video2': {
    timestamp: '2026-03-19T10:00:00Z',
    ai_selected_count: 5,
    user_selected_count: 3,
    ai_over_deleted: [
      { idx: 1, text: '[gap 0.80s]', time: '0.50-1.30' },
      { idx: 2, text: '正常词', time: '1.30-1.60' },
    ],
    ai_under_deleted: [],
  }
});
assert(r4.content.includes('正常词'), 'Should include non-gap text');
assert(!r4.content.includes('[gap'), 'Should filter out gap items');
console.log('  ✅ Pass');

console.log('\n✅ All feedback_aggregator tests passed!');
