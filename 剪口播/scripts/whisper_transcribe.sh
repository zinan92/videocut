#!/bin/bash
#
# Whisper 本地语音识别（替代火山引擎）
#
# 用法: ./whisper_transcribe.sh <audio_file> [model]
# 输出: volcengine_result.json（兼容火山引擎格式）
#

AUDIO_FILE="$1"
MODEL="${2:-small}"

if [ -z "$AUDIO_FILE" ]; then
  echo "❌ 用法: ./whisper_transcribe.sh <audio_file> [model]"
  echo "  model: tiny/base/small/medium/large (默认 small)"
  exit 1
fi

if [ ! -f "$AUDIO_FILE" ]; then
  echo "❌ 找不到音频文件: $AUDIO_FILE"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "🎤 Whisper 本地转录..."
echo "音频: $AUDIO_FILE"
echo "模型: $MODEL"

# 读取热词词典（Whisper 不直接支持热词，但记录下来供后续字幕纠错用）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DICT_FILE="$(dirname "$SCRIPT_DIR")/字幕/词典.txt"
if [ -f "$DICT_FILE" ]; then
  echo "📖 词典: $(grep -c -v '^$' "$DICT_FILE") 个热词（将在字幕纠错阶段使用）"
fi

# Whisper 转录（字级别时间戳）
whisper "$AUDIO_FILE" \
  --model "$MODEL" \
  --language zh \
  --task transcribe \
  --word_timestamps True \
  --output_format json \
  --output_dir "$TMPDIR" \
  --verbose False

if [ $? -ne 0 ]; then
  echo "❌ Whisper 转录失败"
  exit 1
fi

# 找到输出的 JSON 文件
WHISPER_JSON=$(find "$TMPDIR" -name "*.json" -type f | head -1)

if [ -z "$WHISPER_JSON" ]; then
  echo "❌ 未找到 Whisper 输出 JSON"
  exit 1
fi

# 转换 Whisper 格式 → 火山引擎兼容格式
python3 -c "
import json, sys

with open('$WHISPER_JSON') as f:
    data = json.load(f)

utterances = []
for seg in data.get('segments', []):
    words = []
    for w in seg.get('words', []):
        words.append({
            'text': w['word'],
            'start_time': int(w['start'] * 1000),
            'end_time': int(w['end'] * 1000)
        })
    utterances.append({
        'text': seg.get('text', ''),
        'start_time': int(seg['start'] * 1000),
        'end_time': int(seg['end'] * 1000),
        'words': words
    })

result = {'utterances': utterances}
with open('volcengine_result.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

total_words = sum(len(u['words']) for u in utterances)
print(f'✅ 转录完成，已保存 volcengine_result.json')
print(f'📝 识别到 {len(utterances)} 段语音，{total_words} 个字')
"

if [ $? -ne 0 ]; then
  echo "❌ 格式转换失败"
  exit 1
fi
