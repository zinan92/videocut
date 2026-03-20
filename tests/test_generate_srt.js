const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const SCRIPT = path.join(__dirname, '..', '剪口播', 'scripts', 'generate_srt.js');

function runSrt(words) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srt-test-'));
  const inputPath = path.join(tmpDir, '1_subtitles_words.json');
  const outputPath = path.join(tmpDir, '1_subtitles.srt');
  fs.writeFileSync(inputPath, JSON.stringify(words));
  execFileSync(process.execPath, [SCRIPT, inputPath, outputPath], { stdio: 'pipe' });
  const srt = fs.readFileSync(outputPath, 'utf8');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return srt;
}

// Test 1: Basic words → single subtitle
console.log('Test 1: Basic words...');
const srt1 = runSrt([
  { text: '你好', start: 0.5, end: 0.8, isGap: false },
  { text: '世界', start: 0.8, end: 1.2, isGap: false },
]);
assert(srt1.includes('你好世界'), 'Should combine adjacent words');
assert(srt1.includes('00:00:00,500'), 'Should have correct start time');
console.log('  ✅ Pass');

// Test 2: Gap ≥ 0.5s splits into separate subtitles
console.log('Test 2: Gap splits...');
const srt2 = runSrt([
  { text: '第一句', start: 0, end: 0.5, isGap: false },
  { start: 0.5, end: 1.2, isGap: true },
  { text: '第二句', start: 1.2, end: 1.8, isGap: false },
]);
assert(srt2.includes('1\n'), 'Should have subtitle 1');
assert(srt2.includes('2\n'), 'Should have subtitle 2');
assert(srt2.includes('第一句'), 'Should have first sentence');
assert(srt2.includes('第二句'), 'Should have second sentence');
console.log('  ✅ Pass');

// Test 3: Short gap < 0.5s does NOT split
console.log('Test 3: Short gap no split...');
const srt3 = runSrt([
  { text: '不', start: 0, end: 0.2, isGap: false },
  { start: 0.2, end: 0.5, isGap: true },  // 0.3s gap, should NOT split
  { text: '分开', start: 0.5, end: 0.8, isGap: false },
]);
assert(srt3.includes('不分开'), 'Should NOT split on short gap');
assert(!srt3.includes('2\n'), 'Should have only 1 subtitle');
console.log('  ✅ Pass');

// Test 4: Punctuation splits
console.log('Test 4: Punctuation splits...');
const srt4 = runSrt([
  { text: '句子一。', start: 0, end: 1, isGap: false },
  { text: '句子二', start: 1, end: 2, isGap: false },
]);
assert(srt4.includes('句子一。'), 'Should split at period');
assert(srt4.includes('2\n'), 'Should have subtitle 2');
console.log('  ✅ Pass');

// Test 5: Empty input
console.log('Test 5: Empty input...');
const srt5 = runSrt([]);
assert(srt5.trim() === '', 'Empty input should produce empty SRT');
console.log('  ✅ Pass');

// Test 6: Time formatting (hours)
console.log('Test 6: Time formatting...');
const srt6 = runSrt([
  { text: '很久以后', start: 3661.5, end: 3663, isGap: false },
]);
assert(srt6.includes('01:01:01,500'), 'Should format hours correctly');
console.log('  ✅ Pass');

// Test 7: Only gaps (no words)
console.log('Test 7: Only gaps...');
const srt7 = runSrt([
  { start: 0, end: 1, isGap: true },
  { start: 1, end: 2, isGap: true },
]);
assert(srt7.trim() === '', 'Only gaps should produce empty SRT');
console.log('  ✅ Pass');

console.log('\n✅ All generate_srt tests passed!');
