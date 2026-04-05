#!/usr/bin/env python3

import json
import sys

from mlx_whisper import transcribe


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: mlx_transcribe.py <audio_path> <model_repo> <output_json>", file=sys.stderr)
        return 1

    audio_path, model_repo, output_json = sys.argv[1:4]
    result = transcribe(
        audio_path,
        path_or_hf_repo=model_repo,
        verbose=False,
        language="zh",
        task="transcribe",
        word_timestamps=True,
        fp16=False,
    )

    with open(output_json, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
