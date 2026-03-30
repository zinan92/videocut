#!/bin/bash
INPUT="$1"; START="$2"; END="$3"; OUTPUT="$4"
if [ -z "$INPUT" ] || [ -z "$START" ] || [ -z "$END" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: split.sh <input.mp4> <start_sec> <end_sec> <output.mp4>"; exit 1
fi
DURATION=$(echo "$END - $START" | bc)
ffmpeg -y -ss "$START" -i "file:$INPUT" -t "$DURATION" \
  -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k \
  "file:$OUTPUT" 2>/dev/null
[ $? -eq 0 ] && echo "Done: $OUTPUT" || { echo "Clip failed"; exit 1; }
