---
name: cover
description: Generate thumbnail and quote cards from hook quotes
allowed-tools:
  - Read
  - Write
  - Bash
---

# Cover

## Prerequisites
- Chrome/Chromium installed (headless screenshots)

## Usage
videocut cover -o output/ [--quotes hooks.json] [--text "手动金句"]

## Input
- hooks.json (from hook capability) or manual quote text

## Output
- card_1.png through card_5.png — 1080×1080 quote cards

## Flow
1. Read quotes from hooks.json or --text flag
2. Render HTML template per quote
3. Chrome Headless screenshot to PNG
