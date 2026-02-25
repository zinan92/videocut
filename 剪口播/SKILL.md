---
name: videocut:剪口播
description: 视频转录和口误识别。生成审查稿和删除任务清单。触发词：剪口播、处理视频、识别口误
---

# 剪口播 v3

> Whisper 本地转录 + AI 口误识别 + 网页审核

## 快速使用

```bash
# 一键处理
./run.sh /path/to/video.mp4

# 或手动分步（见下方）
```

## 输出目录结构

```
output/
└── YYYY-MM-DD_视频名/
    ├── 1_转录/
    │   ├── audio.mp3
    │   ├── whisper_result.json
    │   └── subtitles_words.json
    ├── 2_分析/
    │   ├── readable.txt
    │   ├── sentences.txt
    │   ├── auto_selected.json
    │   └── 口误分析.md
    └── 3_审核/
        ├── review.html
        └── delete_segments.json
```

## 流程

```
1. 提取音频 (ffmpeg)
    ↓
2. Whisper 本地转录 + 生成字级别字幕
    ↓
3. AI 分析口误/静音，生成预选列表
    ↓
4. 生成审核网页 + 启动服务器
    ↓
5. 用户网页确认 → 执行剪辑
```

## 手动执行步骤

### 步骤 0: 创建输出目录

```bash
VIDEO_PATH="/path/to/视频.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")/../剪口播/scripts" && pwd)"

mkdir -p "$BASE_DIR/1_转录" "$BASE_DIR/2_分析" "$BASE_DIR/3_审核"
cd "$BASE_DIR"
```

### 步骤 1-2: 转录

```bash
cd 1_转录

# 提取音频
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# Whisper 本地转录（无需上传，无需 API Key）
"$SCRIPT_DIR/whisper_transcribe.sh" audio.mp3 small
# 输出: volcengine_result.json（兼容格式）

# 生成字级别字幕
node "$SCRIPT_DIR/generate_subtitles.js" volcengine_result.json
# 输出: subtitles_words.json

cd ..
```

### 步骤 3: 分析口误（脚本+AI）

#### 3.1 生成易读格式 + 句子列表

```bash
cd 2_分析

# readable.txt
node -e "
const data = require('../1_转录/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[静' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\n'));
"

# sentences.txt
node -e "
const data = require('../1_转录/subtitles_words.json');
let sentences = [], curr = { text: '', startIdx: -1, endIdx: -1 };
data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);
sentences.forEach((s, i) => console.log(i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text));
" > sentences.txt
```

#### 3.2 自动标记静音

```bash
node -e "
const words = require('../1_转录/subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('auto_selected.json', JSON.stringify(selected, null, 2));
console.log('≥0.5s静音数量:', selected.length);
"
```

#### 3.3 AI 分析口误（追加到 auto_selected.json）

读 `用户习惯/` 下的规则文件，分段读 readable.txt + sentences.txt 分析。

**检测规则（按优先级）**：

| # | 类型 | 判断方法 | 删除范围 |
|---|------|----------|----------|
| 1 | 重复句 | 相邻句子开头≥5字相同 | 较短的**整句** |
| 2 | 隔一句重复 | 中间是残句时，比对前后句 | 前句+残句 |
| 3 | 残句 | 话说一半+静音 | **整个残句** |
| 4 | 句内重复 | A+中间+A 模式 | 前面部分 |
| 5 | 卡顿词 | 那个那个、就是就是 | 前面部分 |
| 6 | 重说纠正 | 部分重复/否定纠正 | 前面部分 |
| 7 | 语气词 | 嗯、啊、那个 | 标记但不自动删 |

🚨 **关键：行号 ≠ idx**。readable.txt 格式: `idx|内容|时间`，用 idx 值。

### 步骤 4-5: 审核 + 剪辑

```bash
cd ../3_审核

# 生成审核网页
node "$SCRIPT_DIR/generate_review.js" \
  ../1_转录/subtitles_words.json \
  ../2_分析/auto_selected.json \
  ../1_转录/audio.mp3

# 启动审核服务器
node "$SCRIPT_DIR/review_server.js" 8899 "$VIDEO_PATH"
# 打开 http://localhost:8899
# 用户确认后点「执行剪辑」
```

或跳过网页审核直接剪辑：

```bash
# 将 idx 列表转为时间段
node -e "
const words = require('../1_转录/subtitles_words.json');
const selected = require('../2_分析/auto_selected.json');
const segs = [];
for (const idx of selected) {
  const w = words[idx];
  if (w) segs.push({ start: w.start, end: w.end });
}
segs.sort((a, b) => a.start - b.start);
const merged = [];
for (const seg of segs) {
  if (merged.length && seg.start <= merged[merged.length-1].end + 0.05) {
    merged[merged.length-1].end = Math.max(merged[merged.length-1].end, seg.end);
  } else merged.push({...seg});
}
require('fs').writeFileSync('delete_segments.json', JSON.stringify(merged, null, 2));
console.log(merged.length + ' segments, ' + merged.reduce((s,x) => s + x.end - x.start, 0).toFixed(1) + 's to delete');
"

# 执行剪辑
bash "$SCRIPT_DIR/cut_video.sh" "$VIDEO_PATH" delete_segments.json output_cut.mp4
```

## 数据格式

### subtitles_words.json
```json
[
  {"text": "大", "start": 0.12, "end": 0.2, "isGap": false},
  {"text": "", "start": 6.78, "end": 7.48, "isGap": true}
]
```

### auto_selected.json
```json
[72, 85, 120]
```

## 依赖

| 依赖 | 用途 | 安装 |
|------|------|------|
| FFmpeg | 音视频处理 | `brew install ffmpeg` |
| Whisper | 语音转录 | `pip install openai-whisper` |
| Node.js 18+ | 脚本运行 | `brew install node` |
