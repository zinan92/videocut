# MLX Transcription Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `videocut` default to `mlx-whisper` on Apple Silicon while preserving the existing transcript artifacts consumed by downstream capabilities.

**Architecture:** JavaScript resolves a transcription backend and Python runtime, then shells out to a small MLX adapter that writes the same `volcengine_result.json` contract the current pipeline already expects. The existing Whisper shell wrapper remains available only as an explicit backend.

**Tech Stack:** Node.js, Python 3.13, mlx-whisper, MLX, node:test, Bash

---

### Task 1: Lock backend policy with tests

**Files:**
- Modify: `tests/capabilities/transcribe.test.js`
- Modify: `capabilities/transcribe/index.js`

**Step 1: Write the failing test**

Add tests that verify:
- Apple Silicon defaults to backend `mlx`
- explicit `whisper` backend is still allowed
- unsupported backends throw a clear error

**Step 2: Run test to verify it fails**

Run: `node --test tests/capabilities/transcribe.test.js`

**Step 3: Write minimal implementation**

Add backend resolution helpers and wire them into `run()`.

**Step 4: Run test to verify it passes**

Run: `node --test tests/capabilities/transcribe.test.js`

### Task 2: Add MLX adapter tests

**Files:**
- Create: `tests/capabilities/transcribe-mlx.test.js`
- Create: `capabilities/transcribe/mlx_transcribe.py`

**Step 1: Write the failing test**

Add a focused test for converting MLX-style segments into the `volcengine_result.json` structure.

**Step 2: Run test to verify it fails**

Run: `node --test tests/capabilities/transcribe-mlx.test.js`

**Step 3: Write minimal implementation**

Implement a small MLX adapter that:
- calls `mlx_whisper.transcribe`
- normalizes segment/word output
- writes `volcengine_result.json`

**Step 4: Run test to verify it passes**

Run: `node --test tests/capabilities/transcribe-mlx.test.js`

### Task 3: Resolve MLX runtime and shell entrypoint

**Files:**
- Create: `capabilities/transcribe/mlx.sh`
- Modify: `capabilities/transcribe/index.js`
- Modify: `.gitignore`

**Step 1: Write minimal implementation**

Add runtime resolution logic and a shell entrypoint that uses:
- `MLX_WHISPER_PYTHON`
- repo-local `.venv-mlx-whisper/bin/python`

**Step 2: Run targeted verification**

Run:
- `node --test tests/capabilities/transcribe.test.js`
- `node --test tests/capabilities/transcribe-mlx.test.js`

### Task 4: Bootstrap local MLX runtime and verify end-to-end

**Files:**
- Optional local runtime only: `.venv-mlx-whisper/`

**Step 1: Install runtime**

Create a repo-local Python 3.13 venv and install `mlx-whisper`.

**Step 2: Run real transcription verification**

Run a real Apple Silicon transcription command against a short speech sample and confirm output artifacts are created.

### Task 5: Full verification and publish

**Files:**
- Modify: `tests/cli.test.js`
- Modify: `capabilities/transcribe/SKILL.md` if needed

**Step 1: Run full test suite**

Run: `npm test`

**Step 2: Run end-to-end proof**

Run the canonical `content-toolkit -> videocut` transcription path outside the sandbox and verify it completes with MLX.

**Step 3: Commit and push**

Commit the `videocut` code changes and push `main`.
