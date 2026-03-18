# Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web dashboard (React + Vite + Express) that lets users upload a video, watch the pipeline run in real-time, preview all generated content, and publish to 4 platforms.

**Architecture:** Express backend spawns `pipeline.sh` as child process and streams stdout via SSE. React frontend shows upload → progress → publish flow. Content files served via Express static/API routes. Clipboard and browser-open handled client-side.

**Tech Stack:** React 18, Vite 5, TypeScript, Tailwind CSS 3, Express 4, Multer, SSE

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `web/package.json` | Dependencies and scripts |
| Create | `web/tsconfig.json` | TypeScript config |
| Create | `web/vite.config.ts` | Vite config with proxy |
| Create | `web/tailwind.config.js` | Tailwind config |
| Create | `web/postcss.config.js` | PostCSS for Tailwind |
| Create | `web/index.html` | Vite entry HTML |
| Create | `web/server.js` | Express backend (API + SSE + static) |
| Create | `web/src/main.tsx` | React entry |
| Create | `web/src/App.tsx` | Router: / and /publish/:dir |
| Create | `web/src/index.css` | Tailwind imports |
| Create | `web/src/lib/api.ts` | Fetch helpers |
| Create | `web/src/pages/PipelinePage.tsx` | Upload + SSE progress |
| Create | `web/src/pages/PublishPage.tsx` | 4-platform publish console |
| Create | `web/src/components/FileUpload.tsx` | Drag-drop file upload |
| Create | `web/src/components/PhaseProgress.tsx` | Phase progress bars |
| Create | `web/src/components/PlatformCard.tsx` | Single platform preview+actions |
| Modify | `web/.gitignore` | Ignore node_modules, dist |

---

## Task 1: Scaffold React + Vite + Tailwind project

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/tailwind.config.js`, `web/postcss.config.js`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "videocut-dashboard",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"node server.js\" \"vite\"",
    "dev:frontend": "vite",
    "dev:server": "node server.js",
    "build": "vite build",
    "start": "NODE_ENV=production node server.js",
    "preview": "vite preview"
  },
  "dependencies": {
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "concurrently": "^9.0.0",
    "postcss": "^8.4.47",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#1a1a2e',
          accent: '#e94560',
        },
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Videocut Dashboard</title>
  </head>
  <body class="bg-gray-950 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

- [ ] **Step 9: Create src/App.tsx (placeholder)**

```tsx
import { Routes, Route } from 'react-router-dom'

function PipelinePage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">🎬 Videocut Dashboard</h1><p className="text-gray-400 mt-2">Pipeline page — coming soon</p></div>
}

function PublishPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">📤 Publish</h1><p className="text-gray-400 mt-2">Publish page — coming soon</p></div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PipelinePage />} />
      <Route path="/publish/:dir" element={<PublishPage />} />
    </Routes>
  )
}
```

- [ ] **Step 10: Create .gitignore**

```
node_modules/
dist/
.vite/
```

- [ ] **Step 11: Install dependencies and verify**

```bash
cd /Users/wendy/videocut/web
npm install
npm run dev:frontend &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

- [ ] **Step 12: Commit**

```bash
cd /Users/wendy/videocut
git add web/
git commit -m "feat: scaffold React + Vite + Tailwind dashboard"
```

---

## Task 2: Express backend with API endpoints

**Files:**
- Create: `web/server.js`

- [ ] **Step 1: Create server.js**

```javascript
import express from 'express'
import { spawn } from 'child_process'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(ROOT_DIR, 'output')

const app = express()
app.use(express.json())

// ─── File upload ────────────────────────────────────────────────────────────
const upload = multer({ dest: path.join(ROOT_DIR, 'uploads') })

app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  // Rename to preserve original extension
  const ext = path.extname(req.file.originalname) || '.mp4'
  const newPath = req.file.path + ext
  fs.renameSync(req.file.path, newPath)
  res.json({ path: newPath, name: req.file.originalname })
})

// ─── Pipeline SSE ───────────────────────────────────────────────────────────
app.get('/api/pipeline/start', (req, res) => {
  const videoPath = req.query.video
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(400).json({ error: 'Invalid video path' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const pipelineScript = path.join(ROOT_DIR, 'pipeline.sh')
  const child = spawn('bash', [pipelineScript, videoPath], {
    cwd: ROOT_DIR,
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  // Strip ANSI codes
  const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '')

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  child.stdout.on('data', (chunk) => {
    const lines = stripAnsi(chunk.toString()).split('\n').filter(Boolean)
    for (const line of lines) {
      // Detect phase transitions
      const phaseMatch = line.match(/═══\s*Phase\s*(\d+):\s*(.+?)\s*═══/)
      if (phaseMatch) {
        sendEvent('phase', { phase: parseInt(phaseMatch[1]), name: phaseMatch[2] })
      }
      // Detect completion
      else if (line.includes('Pipeline 完成')) {
        const timeMatch = line.match(/耗时:\s*(\S+)/)
        sendEvent('complete', { elapsed: timeMatch ? timeMatch[1] : '' })
      }
      // Regular log line
      else {
        sendEvent('log', { message: line })
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    sendEvent('error', { message: stripAnsi(chunk.toString()) })
  })

  child.on('close', (code) => {
    // Find the output directory (most recent in output/)
    let outputDir = null
    if (fs.existsSync(OUTPUT_DIR)) {
      const dirs = fs.readdirSync(OUTPUT_DIR)
        .filter(d => fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory())
        .sort()
      if (dirs.length > 0) {
        outputDir = dirs[dirs.length - 1]
      }
    }
    sendEvent('done', { code, outputDir })
    res.end()
  })

  req.on('close', () => {
    child.kill('SIGTERM')
  })
})

// ─── Output listing ─────────────────────────────────────────────────────────
app.get('/api/outputs', (_req, res) => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return res.json([])
  }
  const dirs = fs.readdirSync(OUTPUT_DIR)
    .filter(d => fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory())
    .sort()
    .reverse()
    .map(d => {
      const manifestPath = path.join(OUTPUT_DIR, d, 'manifest.json')
      let manifest = null
      if (fs.existsSync(manifestPath)) {
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch {}
      }
      return { name: d, manifest }
    })
  res.json(dirs)
})

// ─── Single output detail ───────────────────────────────────────────────────
app.get('/api/outputs/:dir', (req, res) => {
  const dir = path.join(OUTPUT_DIR, req.params.dir)
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: 'Not found' })
  }

  // Read all text content files
  const readFile = (name) => {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
    return null
  }

  const readJson = (name) => {
    const content = readFile(name)
    if (!content) return null
    try { return JSON.parse(content) } catch { return null }
  }

  const cards = fs.readdirSync(dir)
    .filter(f => /^4_card_\d+\.png$/.test(f))
    .sort()

  res.json({
    name: req.params.dir,
    manifest: readJson('manifest.json'),
    content: {
      transcript: readFile('4_transcript.txt'),
      article_cn: readFile('4_article_cn.md'),
      article_en: readFile('4_article_en.md'),
      video_meta: readJson('4_video_meta.json'),
      quotes: readJson('4_quotes.json'),
      jike_post: readFile('5_jike_post.md'),
      xhs_caption: readFile('5_xhs_caption.md'),
      wechat_article: readFile('5_wechat_article.md'),
      x_thread: readJson('5_x_thread.json'),
      x_post: readFile('5_x_post.md'),
    },
    cards,
    hasVideo: fs.existsSync(path.join(dir, '3_output_cut.mp4')),
    hasThumbnail: fs.existsSync(path.join(dir, '4_thumbnail.png')),
    hasPodcast: fs.existsSync(path.join(dir, '4_podcast.mp3')),
  })
})

// ─── Serve output files (images, video, audio) ─────────────────────────────
app.get('/api/outputs/:dir/file/:name', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.dir, req.params.name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.sendFile(filePath)
})

// ─── Update publish status ──────────────────────────────────────────────────
app.post('/api/outputs/:dir/publish/:platform', (req, res) => {
  const manifestPath = path.join(OUTPUT_DIR, req.params.dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Manifest not found' })
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const platform = req.params.platform
    if (manifest.platforms && manifest.platforms[platform]) {
      manifest.platforms[platform].status = req.body.status || 'published'
      manifest.platforms[platform].published_at = new Date().toISOString()
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Production: serve Vite build ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3456
app.listen(PORT, () => {
  console.log(`🎬 Videocut Dashboard server: http://localhost:${PORT}`)
  console.log(`📂 Output directory: ${OUTPUT_DIR}`)
})
```

- [ ] **Step 2: Verify server starts**

```bash
cd /Users/wendy/videocut/web
node server.js &
sleep 2
curl -s http://localhost:3456/api/outputs | head -20
kill %1
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wendy/videocut
git add web/server.js
git commit -m "feat: add Express backend with upload, SSE pipeline, and output APIs"
```

---

## Task 3: API helpers + FileUpload component

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/components/FileUpload.tsx`

- [ ] **Step 1: Create src/lib/api.ts**

```typescript
const BASE = ''

export async function uploadVideo(file: File): Promise<{ path: string; name: string }> {
  const form = new FormData()
  form.append('video', file)
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export function startPipeline(videoPath: string): EventSource {
  return new EventSource(`${BASE}/api/pipeline/start?video=${encodeURIComponent(videoPath)}`)
}

export async function listOutputs(): Promise<Array<{ name: string; manifest: unknown }>> {
  const res = await fetch(`${BASE}/api/outputs`)
  return res.json()
}

export async function getOutput(dir: string) {
  const res = await fetch(`${BASE}/api/outputs/${encodeURIComponent(dir)}`)
  if (!res.ok) throw new Error('Not found')
  return res.json()
}

export function fileUrl(dir: string, name: string): string {
  return `${BASE}/api/outputs/${encodeURIComponent(dir)}/file/${encodeURIComponent(name)}`
}

export async function updatePublishStatus(dir: string, platform: string, status: string) {
  const res = await fetch(`${BASE}/api/outputs/${encodeURIComponent(dir)}/publish/${platform}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return res.json()
}
```

- [ ] **Step 2: Create src/components/FileUpload.tsx**

```tsx
import { useCallback, useState } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export default function FileUpload({ onFileSelected, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-200
        ${dragOver ? 'border-brand-accent bg-brand-accent/10' : 'border-gray-700 hover:border-gray-500'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
        id="video-upload"
        disabled={disabled}
      />
      <label htmlFor="video-upload" className="cursor-pointer">
        <div className="text-4xl mb-4">📹</div>
        <p className="text-lg font-medium">拖拽视频文件到这里</p>
        <p className="text-gray-500 mt-2">或点击选择文件 (MP4, MOV)</p>
      </label>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wendy/videocut
git add web/src/lib/api.ts web/src/components/FileUpload.tsx
git commit -m "feat: add API helpers and FileUpload component"
```

---

## Task 4: PhaseProgress component

**Files:**
- Create: `web/src/components/PhaseProgress.tsx`

- [ ] **Step 1: Create the component**

```tsx
interface Phase {
  number: number
  name: string
  status: 'pending' | 'active' | 'done'
}

interface Props {
  phases: Phase[]
  logs: string[]
  elapsed?: string
}

export default function PhaseProgress({ phases, logs, elapsed }: Props) {
  return (
    <div className="space-y-6">
      {/* Phase bars */}
      <div className="space-y-3">
        {phases.map((p) => (
          <div key={p.number} className="flex items-center gap-3">
            <span className="w-6 text-center">
              {p.status === 'done' ? '✅' : p.status === 'active' ? '⏳' : '○'}
            </span>
            <span className={`text-sm font-medium w-48 ${p.status === 'active' ? 'text-brand-accent' : p.status === 'done' ? 'text-green-400' : 'text-gray-600'}`}>
              Phase {p.number}: {p.name}
            </span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  p.status === 'done' ? 'w-full bg-green-500' :
                  p.status === 'active' ? 'w-1/2 bg-brand-accent animate-pulse' :
                  'w-0'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {elapsed && (
        <p className="text-sm text-gray-500">耗时: {elapsed}</p>
      )}

      {/* Log output */}
      <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-gray-400">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wendy/videocut
git add web/src/components/PhaseProgress.tsx
git commit -m "feat: add PhaseProgress component with SSE-driven progress bars"
```

---

## Task 5: PipelinePage — full upload + progress flow

**Files:**
- Create: `web/src/pages/PipelinePage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create PipelinePage.tsx**

```tsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import PhaseProgress from '../components/PhaseProgress'
import { uploadVideo, startPipeline } from '../lib/api'

const PHASE_NAMES: Record<number, string> = {
  1: '视频剪辑',
  2: '内容降维',
  3: '平台内容',
  4: '卡片生成',
  5: 'Manifest',
  6: 'Summary',
}

type Stage = 'idle' | 'uploading' | 'running' | 'done' | 'error'

interface Phase {
  number: number
  name: string
  status: 'pending' | 'active' | 'done'
}

export default function PipelinePage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [phases, setPhases] = useState<Phase[]>(
    [1, 2, 3, 4, 5, 6].map(n => ({ number: n, name: PHASE_NAMES[n], status: 'pending' as const }))
  )
  const [logs, setLogs] = useState<string[]>([])
  const [elapsed, setElapsed] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = (line: string) => {
    setLogs(prev => [...prev.slice(-200), line])
  }

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setStage('uploading')
    addLog(`上传中: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

    try {
      const { path: videoPath } = await uploadVideo(file)
      addLog(`上传完成: ${videoPath}`)
      setStage('running')

      const es = startPipeline(videoPath)

      es.onmessage = (event) => {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'phase':
            addLog(`═══ Phase ${data.phase}: ${data.name} ═══`)
            setPhases(prev => prev.map(p => ({
              ...p,
              status: p.number < data.phase ? 'done' :
                      p.number === data.phase ? 'active' : 'pending'
            })))
            break

          case 'log':
            addLog(data.message)
            break

          case 'error':
            addLog(`[ERROR] ${data.message}`)
            break

          case 'complete':
            setElapsed(data.elapsed)
            setPhases(prev => prev.map(p => ({ ...p, status: 'done' as const })))
            break

          case 'done':
            es.close()
            if (data.code === 0 && data.outputDir) {
              setOutputDir(data.outputDir)
              setStage('done')
              addLog(`Pipeline 完成！输出: ${data.outputDir}`)
            } else {
              setStage('error')
              setErrorMsg(`Pipeline 退出码: ${data.code}`)
            }
            break
        }
      }

      es.onerror = () => {
        es.close()
        setStage('error')
        setErrorMsg('与服务器的连接断开')
      }
    } catch (err) {
      setStage('error')
      setErrorMsg(String(err))
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">🎬 Videocut Dashboard</h1>
      <p className="text-gray-500 mb-8">上传视频 → 自动生成多平台内容 → 一键发布</p>

      {stage === 'idle' && (
        <FileUpload onFileSelected={handleFile} />
      )}

      {stage === 'uploading' && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4 animate-pulse">📤</div>
          <p className="text-lg">上传中: {fileName}</p>
        </div>
      )}

      {(stage === 'running' || stage === 'done' || stage === 'error') && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">📹 {fileName}</span>
          </div>

          <PhaseProgress phases={phases} logs={logs} elapsed={elapsed} />

          {stage === 'done' && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 flex items-center justify-between">
              <span className="text-green-400 font-medium">✅ Pipeline 完成！</span>
              <button
                onClick={() => navigate(`/publish/${outputDir}`)}
                className="bg-brand-accent hover:bg-brand-accent/80 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                查看产出 & 发布 →
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <span className="text-red-400">❌ {errorMsg}</span>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx with real pages**

```tsx
import { Routes, Route } from 'react-router-dom'
import PipelinePage from './pages/PipelinePage'

// PublishPage placeholder until Task 7
function PublishPage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">📤 Publish</h1><p className="text-gray-400 mt-2">Coming soon</p></div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PipelinePage />} />
      <Route path="/publish/:dir" element={<PublishPage />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/wendy/videocut/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wendy/videocut
git add web/src/pages/PipelinePage.tsx web/src/App.tsx
git commit -m "feat: add PipelinePage with upload, SSE progress, and completion flow"
```

---

## Task 6: PlatformCard component

**Files:**
- Create: `web/src/components/PlatformCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'

interface Props {
  name: string
  icon: string
  status: string
  previewContent: string
  previewLabel?: string
  extraInfo?: React.ReactNode
  copyContent: string
  openUrl: string
  onStatusChange: (status: string) => void
}

const STATUS_STYLES: Record<string, { icon: string; label: string; color: string }> = {
  pending:   { icon: '⏳', label: '待发布', color: 'text-yellow-400' },
  published: { icon: '✅', label: '已发布', color: 'text-green-400' },
  skipped:   { icon: '⏭', label: '已跳过', color: 'text-gray-500' },
  failed:    { icon: '❌', label: '失败', color: 'text-red-400' },
}

export default function PlatformCard({
  name, icon, status, previewContent, previewLabel,
  extraInfo, copyContent, openUrl, onStatusChange
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusInfo = STATUS_STYLES[status] || STATUS_STYLES.pending

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">
          <span className="mr-2">{icon}</span>{name}
        </h3>
        <span className={`text-sm ${statusInfo.color}`}>
          {statusInfo.icon} {statusInfo.label}
        </span>
      </div>

      {/* Preview */}
      <div className="flex-1 mb-4">
        {previewLabel && (
          <p className="text-xs text-gray-500 mb-1">{previewLabel}</p>
        )}
        <div className="bg-gray-950 rounded-lg p-3 text-sm text-gray-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {previewContent.slice(0, 500)}
          {previewContent.length > 500 && <span className="text-gray-600">...</span>}
        </div>
      </div>

      {extraInfo && <div className="mb-4">{extraInfo}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 px-3 rounded-lg transition-colors"
        >
          {copied ? '✅ 已复制' : '📋 复制内容'}
        </button>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 px-3 rounded-lg transition-colors text-center"
        >
          🌐 打开平台
        </a>
      </div>

      {/* Mark as published */}
      {status === 'pending' && (
        <button
          onClick={() => onStatusChange('published')}
          className="mt-2 w-full bg-brand-accent/20 hover:bg-brand-accent/30 text-brand-accent text-sm py-2 rounded-lg transition-colors"
        >
          标记为已发布
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wendy/videocut
git add web/src/components/PlatformCard.tsx
git commit -m "feat: add PlatformCard component with copy, open, and status tracking"
```

---

## Task 7: PublishPage — 4-platform publish console

**Files:**
- Create: `web/src/pages/PublishPage.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create PublishPage.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PlatformCard from '../components/PlatformCard'
import { getOutput, fileUrl, updatePublishStatus } from '../lib/api'

interface OutputData {
  name: string
  manifest: { platforms: Record<string, { status: string }> } | null
  content: {
    video_meta: { title_cn: string; hook: { cn: string }; tags_cn: string[] } | null
    xhs_caption: string | null
    wechat_article: string | null
    x_thread: Array<{ tweet: string; position: number }> | null
    x_post: string | null
  }
  cards: string[]
  hasVideo: boolean
  hasThumbnail: boolean
}

const PLATFORM_URLS: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  xhs: 'https://creator.xiaohongshu.com/publish/publish',
  wechat: 'https://mp.weixin.qq.com/',
  x_thread: 'https://x.com/compose/post',
}

export default function PublishPage() {
  const { dir } = useParams<{ dir: string }>()
  const [data, setData] = useState<OutputData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dir) return
    getOutput(dir)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [dir])

  const getStatus = (platform: string) =>
    data?.manifest?.platforms?.[platform]?.status || 'pending'

  const handleStatusChange = async (platform: string, status: string) => {
    if (!dir) return
    await updatePublishStatus(dir, platform, status)
    // Refresh data
    const updated = await getOutput(dir)
    setData(updated)
  }

  if (loading) return <div className="p-8 text-gray-500">加载中...</div>
  if (error) return <div className="p-8 text-red-400">❌ {error}</div>
  if (!data) return <div className="p-8 text-gray-500">未找到数据</div>

  const meta = data.content.video_meta
  const title = meta?.title_cn || dir || ''
  const hook = meta?.hook?.cn || ''
  const tags = (meta?.tags_cn || []).join(' ')

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm mb-2 block">← 返回</Link>
          <h1 className="text-2xl font-bold">📤 内容发布</h1>
          <p className="text-gray-500 mt-1">{dir}</p>
        </div>
        {data.hasThumbnail && (
          <img
            src={fileUrl(dir!, '4_thumbnail.png')}
            alt="thumbnail"
            className="w-32 h-20 object-cover rounded-lg"
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 抖音 */}
        <PlatformCard
          name="抖音"
          icon="📱"
          status={getStatus('douyin')}
          previewContent={`标题: ${title}\nHook: ${hook}\n标签: ${tags}`}
          previewLabel="视频元数据"
          copyContent={title}
          openUrl={PLATFORM_URLS.douyin}
          onStatusChange={(s) => handleStatusChange('douyin', s)}
          extraInfo={
            data.hasVideo ? (
              <p className="text-xs text-gray-500">📹 视频文件: 3_output_cut.mp4</p>
            ) : null
          }
        />

        {/* 小红书 */}
        <PlatformCard
          name="小红书"
          icon="📕"
          status={getStatus('xhs')}
          previewContent={data.content.xhs_caption || '(无文案)'}
          previewLabel="小红书文案"
          copyContent={data.content.xhs_caption || ''}
          openUrl={PLATFORM_URLS.xhs}
          onStatusChange={(s) => handleStatusChange('xhs', s)}
          extraInfo={
            data.cards.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto">
                {data.cards.map(c => (
                  <img
                    key={c}
                    src={fileUrl(dir!, c)}
                    alt={c}
                    className="w-16 h-16 rounded object-cover flex-shrink-0"
                  />
                ))}
              </div>
            ) : null
          }
        />

        {/* 公众号 */}
        <PlatformCard
          name="公众号"
          icon="💬"
          status={getStatus('wechat')}
          previewContent={data.content.wechat_article || '(无文章)'}
          previewLabel="公众号文章"
          copyContent={data.content.wechat_article || ''}
          openUrl={PLATFORM_URLS.wechat}
          onStatusChange={(s) => handleStatusChange('wechat', s)}
        />

        {/* X/Twitter */}
        <PlatformCard
          name="X / Twitter"
          icon="🐦"
          status={getStatus('x_thread')}
          previewContent={
            data.content.x_thread
              ? data.content.x_thread.map((t, i) => `${i + 1}. ${t.tweet}`).join('\n\n')
              : data.content.x_post || '(无推文)'
          }
          previewLabel={data.content.x_thread ? `Thread (${data.content.x_thread.length} 条)` : 'Post'}
          copyContent={
            data.content.x_thread
              ? data.content.x_thread[0]?.tweet || ''
              : data.content.x_post || ''
          }
          openUrl={PLATFORM_URLS.x_thread}
          onStatusChange={(s) => handleStatusChange('x_thread', s)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx to use real PublishPage**

```tsx
import { Routes, Route } from 'react-router-dom'
import PipelinePage from './pages/PipelinePage'
import PublishPage from './pages/PublishPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PipelinePage />} />
      <Route path="/publish/:dir" element={<PublishPage />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/wendy/videocut/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wendy/videocut
git add web/src/pages/PublishPage.tsx web/src/App.tsx
git commit -m "feat: add PublishPage with 4-platform publish console"
```

---

## Task 8: Integration verification + README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Build and verify**

```bash
cd /Users/wendy/videocut/web
npm run build
```
Expected: successful build in `web/dist/`

- [ ] **Step 2: Start production server and verify**

```bash
cd /Users/wendy/videocut/web
NODE_ENV=production node server.js &
sleep 2
curl -s http://localhost:3456/ | head -5
curl -s http://localhost:3456/api/outputs | head -5
kill %1
```

- [ ] **Step 3: Add dashboard section to README.md**

After the "发布" section, add:

```markdown
### Web Dashboard

本地 Web 界面，提供视频上传、Pipeline 实时进度、内容预览和一键发布：

\`\`\`bash
cd web
npm install
npm run dev      # 开发模式 (http://localhost:5173)
npm run build && npm start  # 生产模式 (http://localhost:3456)
\`\`\`

功能：
- 拖拽上传视频，实时查看 6 阶段进度
- 完成后预览所有生成内容（文章、文案、卡片图、推文）
- 每个平台一键复制 + 打开发布页面
- 发布状态自动同步到 manifest.json
```

- [ ] **Step 4: Add web/ to project structure in README**

In the project structure section, add:

```markdown
├── web/                        # Web Dashboard (React + Vite)
│   ├── server.js               # Express 后端 (API + SSE)
│   ├── src/
│   │   ├── pages/              # Pipeline 页 + Publish 页
│   │   └── components/         # FileUpload, PhaseProgress, PlatformCard
│   └── package.json
```

- [ ] **Step 5: Commit**

```bash
cd /Users/wendy/videocut
git add README.md
git commit -m "docs: add web dashboard documentation to README"
```
