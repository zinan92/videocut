# Video Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement.

**Goal:** Add long video splitting to the web dashboard — upload → transcribe → AI chapter analysis → user selects → FFmpeg split + subtitle burn.

**Architecture:** 3 new backend API endpoints + SplitPage with tab integration on homepage. Reuses existing Whisper/FFmpeg/Claude infrastructure.

**Tech Stack:** Express, React, TypeScript, Tailwind, FFmpeg, Whisper, Claude CLI

---

## Tasks

### Task 1: Backend — 3 split API endpoints in server.js
### Task 2: Frontend — SplitPage.tsx + ChapterTimeline + ChapterCard components
### Task 3: App.tsx tab routing + API helpers
### Task 4: Integration verification
