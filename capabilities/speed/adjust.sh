#!/bin/bash
# Usage: adjust.sh <input.mp4> <rate> <output.mp4>
INPUT="$1"; RATE="$2"; OUTPUT="$3"
if [ -z "$INPUT" ] || [ -z "$RATE" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: adjust.sh <input.mp4> <rate> <output.mp4>"; exit 1
fi
ffmpeg -y -i "file:$INPUT" \
  -filter:v "setpts=PTS/${RATE}" \
  -filter:a "atempo=${RATE}" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 192k \
  "file:$OUTPUT" 2>/dev/null
[ $? -eq 0 ] && echo "Done: $OUTPUT" || { echo "Speed adjustment failed"; exit 1; }
