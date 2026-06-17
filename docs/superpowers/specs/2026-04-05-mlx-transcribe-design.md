# MLX Transcription Backend Design

## Goal

Make `videocut` use an Apple-Silicon-native transcription backend by default on macOS arm64, while preserving the current transcript artifacts and keeping explicit access to the legacy `whisper` path when needed.

## Context

`videocut` currently shells out to the OpenAI `whisper` CLI. We already fixed the old behavior where it silently defaulted to CPU, but real-world verification showed the `PyTorch + MPS` path is still brittle for actual transcription workloads on this Mac. By contrast, `mlx` can see and use the Apple GPU successfully in a normal terminal context.

## Approaches Considered

### 1. Keep investing in OpenAI Whisper + PyTorch MPS

- Pros: uses the current backend and keeps the existing code shape
- Cons: we already hit real runtime instability after MPS activation; this remains the higher-risk path for Apple Silicon

### 2. Make `mlx-whisper` the default backend on Apple Silicon

- Pros: aligned with the target hardware, simpler long-term story for Mac users, avoids leaning on fragile `PyTorch + MPS` behavior
- Cons: requires an adapter layer because `videocut` expects a custom JSON contract

### 3. Switch to `whisper.cpp`

- Pros: often stable on Mac, fast native runtime
- Cons: would still require a new adapter layer, and we have already verified `mlx` can access GPU on this machine

## Recommendation

Choose option 2. It best matches the product goal: a stable local transcription path on Apple Silicon.

## Design

### Backend policy

- On `darwin + arm64`, default transcription backend becomes `mlx`
- `--backend whisper` remains available as an explicit escape hatch
- `--backend mlx` is accepted explicitly
- `cpu` remains disallowed as an implicit fallback

### Runtime layout

- Add a dedicated MLX adapter under `capabilities/transcribe/`
- The adapter runs with a Python executable that has `mlx-whisper` installed
- Resolution order:
  1. `MLX_WHISPER_PYTHON`
  2. repo-local `.venv-mlx-whisper/bin/python`
  3. clear install error

### Output contract

- Preserve the current `volcengine_result.json` intermediate contract
- Preserve downstream `generate_words.js` and `transcript.json/.txt/.srt`
- The MLX adapter converts MLX segment output into the same `utterances[].words[]` shape already consumed today

### Error handling

- If MLX runtime is missing, print a direct setup message
- If MLX transcription fails, surface the short human-readable cause only
- No silent fallback from `mlx` to `whisper`

### Verification

- Unit tests for backend resolution and MLX runtime resolution
- Adapter test for conversion into `volcengine_result.json`
- Real end-to-end transcription check outside the sandbox on Apple Silicon
