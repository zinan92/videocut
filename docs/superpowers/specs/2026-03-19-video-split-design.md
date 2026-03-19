# 长视频拆条功能设计

## 概述

在 Dashboard 首页加 tab 切换，新增"长视频拆条"模式。用户上传长视频 → Whisper 转录 → Claude AI 分析话题切割点 → 时间轴可视化展示章节 → 用户勾选要保留的章节 → FFmpeg 逐段切割 + 字幕烧录 → 输出 N 个带字幕短视频。

## 后端新增 API

| Endpoint | 方法 | 说明 |
|----------|------|------|
| `GET /api/split/transcribe?video=path` | SSE | 执行 Whisper 转录，流式返回进度 |
| `POST /api/split/analyze` | POST | 发送转录文本给 Claude，返回章节建议 |
| `POST /api/split/execute` | POST | 接收选中的章节列表，FFmpeg 切割 + 字幕烧录 |

## 转录阶段

复用现有 Whisper 流程，但只跑到转录完成：
1. FFmpeg 提取音频
2. Whisper 转录
3. 生成字级别字幕 + SRT
4. 提取纯文本转录稿

## AI 章节分析

Claude 分析转录稿，输出章节列表。粒度 2-5 分钟，在话题自然转换点切分。

输出格式：`[{title, start, end, summary, keywords}]`

## 前端

- 首页 Tab: "单条口播处理" / "长视频拆条"
- 状态流: idle → transcribing → analyzing → selecting → splitting → done
- 章节选择: 时间轴可视化 + checkbox 卡片列表 + 全选/执行按钮

## 切割执行

FFmpeg 精确切割 + SRT 时间偏移 + 字幕烧录 → `splits/split_N_标题.mp4`

## 文件结构

- Modify: `web/server.js` (3 新 API)
- Create: `web/src/pages/SplitPage.tsx`
- Create: `web/src/components/ChapterTimeline.tsx`
- Create: `web/src/components/ChapterCard.tsx`
- Modify: `web/src/App.tsx` (tab 路由)
- Modify: `web/src/pages/PipelinePage.tsx` (tab wrapper)

## 不做的事

- 不做 AI 口误分析
- 不自动触发 Phase 2-6（用户按需手动触发）
- 不做视频预览播放
