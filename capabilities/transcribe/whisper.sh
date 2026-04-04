#!/bin/bash
#
# Whisper 本地语音识别（替代火山引擎）
#
# 用法: ./whisper_transcribe.sh <audio_file> [model] [device]
# 输出: volcengine_result.json（兼容火山引擎格式）
#

AUDIO_FILE="$1"
MODEL="${2:-small}"
DEVICE="${3:-}"

if [ -z "$AUDIO_FILE" ]; then
  echo "❌ 用法: ./whisper_transcribe.sh <audio_file> [model] [device]"
  echo "  model: tiny/base/small/medium/large (默认 small)"
  exit 1
fi

if [ ! -f "$AUDIO_FILE" ]; then
  echo "❌ 找不到音频文件: $AUDIO_FILE"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

if [ -z "$DEVICE" ]; then
  if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
    DEVICE="mps"
  else
    echo "❌ 未检测到可用加速设备，且已禁用 CPU 转录。"
    exit 1
  fi
fi

if [ "$DEVICE" = "cpu" ]; then
  echo "❌ CPU 转录已禁用。请使用 Apple 芯片加速转录。"
  exit 1
fi

echo "🎤 Whisper 本地转录..."
echo "音频: $AUDIO_FILE"
echo "模型: $MODEL"
echo "设备: $DEVICE"

# 读取热词词典（Whisper 不直接支持热词，但记录下来供后续字幕纠错用）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DICT_FILE="$(dirname "$SCRIPT_DIR")/字幕/词典.txt"
if [ -f "$DICT_FILE" ]; then
  echo "📖 词典: $(grep -c -v '^$' "$DICT_FILE") 个热词（将在字幕纠错阶段使用）"
fi

if [ "$DEVICE" = "mps" ]; then
  WHISPER_BIN="$(command -v whisper)"
  if [ -z "$WHISPER_BIN" ]; then
    echo "❌ 找不到 whisper 命令"
    exit 1
  fi

  WHISPER_PY="$(head -n 1 "$WHISPER_BIN" | sed 's/^#!//')"
  if [ -z "$WHISPER_PY" ] || [ ! -x "$WHISPER_PY" ]; then
    echo "❌ 无法定位 Whisper 的 Python 运行环境"
    exit 1
  fi

  if ! "$WHISPER_PY" -c "import sys, torch; sys.exit(0 if torch.backends.mps.is_available() else 1)" 2>/dev/null; then
    echo "❌ Apple 芯片 MPS 当前不可用，已禁止回退到 CPU。请先修复 Whisper/PyTorch 的 MPS 环境。"
    exit 1
  fi
fi

# Whisper 转录（字级别时间戳）
whisper "$AUDIO_FILE" \
  --model "$MODEL" \
  --device "$DEVICE" \
  --language zh \
  --task transcribe \
  --word_timestamps True \
  --fp16 False \
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
