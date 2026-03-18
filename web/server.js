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

const PORT = process.env.PORT || 3789
app.listen(PORT, () => {
  console.log(`🎬 Videocut Dashboard server: http://localhost:${PORT}`)
  console.log(`📂 Output directory: ${OUTPUT_DIR}`)
})
