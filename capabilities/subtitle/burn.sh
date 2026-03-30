#!/bin/bash
INPUT="$1"; SRT="$2"; OUTPUT="$3"
if [ -z "$INPUT" ] || [ -z "$SRT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: burn.sh <input.mp4> <input.srt> <output.mp4>"; exit 1
fi
TMP_DIR=$(mktemp -d)
cp "$SRT" "$TMP_DIR/subtitle.srt"
ffmpeg -y -i "file:$INPUT" \
  -vf "subtitles='${TMP_DIR}/subtitle.srt':force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=30'" \
  -c:a copy "file:$OUTPUT" 2>/dev/null
EXIT_CODE=$?; rm -rf "$TMP_DIR"
[ $EXIT_CODE -eq 0 ] && echo "Done: $OUTPUT" || { echo "Subtitle burn failed"; exit 1; }
