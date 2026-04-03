# References

Documentation for videocut sub-capabilities, pipeline ordering, and shared libraries.

## Sub-Capability SKILL.md Files

Each sub-capability has its own detailed SKILL.md:

```
capabilities/transcribe/SKILL.md
capabilities/autocut/SKILL.md
capabilities/subtitle/SKILL.md
capabilities/hook/SKILL.md
capabilities/clip/SKILL.md
capabilities/cover/SKILL.md
capabilities/speed/SKILL.md
```

## Pipeline Ordering Rules

```
autocut → speed → subtitle → hook → clip → cover
```

1. **autocut** first — cut filler before any processing
2. **speed** before subtitle — subtitles must match final-speed audio
3. **subtitle** before hook — hook can reuse the SRT file
4. **hook** before cover — cover needs hooks.json
5. **clip** independent — can run after autocut or subtitle
6. **cover** last — depends on hooks.json output

## Autocut Rules System

Autocut uses 9 extensible markdown rule files in `capabilities/autocut/rules/`:

1. 核心原则 (core principles)
2. 语气词检测 (filler word detection)
3. 静音段处理 (silence handling)
4. 重复句检测 (repeated sentence detection)
5. 卡顿词 (stuttered words)
6. 句内重复检测 (intra-sentence repetition)
7. 连续语气词 (consecutive fillers)
8. 重说纠正 (self-correction detection)
9. 残句检测 (incomplete sentence detection)

## Shared Libraries

| Library | Purpose |
|---------|---------|
| `lib/ffmpeg.js` | Video probing, audio extraction, duration detection |
| `lib/srt.js` | SRT parsing, generation, segment merging |
| `lib/claude.js` | Claude CLI wrapper with retry + JSON parsing |
