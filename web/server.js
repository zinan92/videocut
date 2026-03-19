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

// ─── SRT time offset helper ────────────────────────────────────────────────
function offsetSubtitles(srtContent, startSec, endSec) {
  const timeToSec = (t) => {
    const [h, m, rest] = t.split(':')
    const [s, ms] = rest.split(',')
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000
  }

  const secToTime = (sec) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.round((sec % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }

  const blocks = srtContent.trim().split(/\n\n+/)
  const filtered = []
  let index = 1

  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) continue
    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/)
    if (!timeMatch) continue

    const subStart = timeToSec(timeMatch[1])
    const subEnd = timeToSec(timeMatch[2])

    if (subEnd <= startSec || subStart >= endSec) continue

    const newStart = Math.max(0, subStart - startSec)
    const newEnd = Math.min(endSec - startSec, subEnd - startSec)

    filtered.push(`${index}\n${secToTime(newStart)} --> ${secToTime(newEnd)}\n${lines.slice(2).join('\n')}`)
    index++
  }

  return filtered.join('\n\n') + '\n'
}

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

// ─── Split: transcribe (SSE) ────────────────────────────────────────────────
app.get('/api/split/transcribe', (req, res) => {
  const videoPath = req.query.video
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(400).json({ error: 'Invalid video path' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  // Create output directory
  const videoName = path.basename(videoPath)
  const date = new Date().toISOString().split('T')[0]
  const outputDir = path.join(OUTPUT_DIR, `${date}_${videoName}`)
  fs.mkdirSync(outputDir, { recursive: true })

  const scriptsDir = path.join(ROOT_DIR, '剪口播', 'scripts')

  // Step 1: Extract audio
  sendEvent('step', { step: 'audio', message: '提取音频...' })
  const audioPath = path.join(outputDir, '1_audio.mp3')

  const ffmpegAudio = spawn('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-y', audioPath], { stdio: 'pipe' })

  ffmpegAudio.on('close', (code) => {
    if (code !== 0) {
      sendEvent('error', { message: '音频提取失败' })
      res.end()
      return
    }
    sendEvent('step', { step: 'audio', message: '✅ 音频提取完成' })

    // Step 2: Whisper transcribe
    sendEvent('step', { step: 'whisper', message: 'Whisper 转录中...' })
    const whisper = spawn('bash', [path.join(scriptsDir, 'whisper_transcribe.sh'), '1_audio.mp3', 'small'], {
      cwd: outputDir,
      stdio: 'pipe',
    })

    whisper.stdout.on('data', (chunk) => {
      sendEvent('log', { message: chunk.toString().trim() })
    })

    whisper.on('close', (whisperCode) => {
      if (whisperCode !== 0) {
        sendEvent('error', { message: 'Whisper 转录失败' })
        res.end()
        return
      }

      // Rename output
      const volcPath = path.join(outputDir, 'volcengine_result.json')
      const renamedPath = path.join(outputDir, '1_volcengine_result.json')
      if (fs.existsSync(volcPath)) fs.renameSync(volcPath, renamedPath)

      sendEvent('step', { step: 'whisper', message: '✅ 转录完成' })

      // Step 3: Generate subtitles
      sendEvent('step', { step: 'subtitles', message: '生成字幕...' })
      const genSub = spawn('node', [path.join(scriptsDir, 'generate_subtitles.js'), renamedPath], {
        cwd: outputDir,
        stdio: 'pipe',
      })

      genSub.on('close', () => {
        // Rename subtitles_words.json
        const subWordsPath = path.join(outputDir, 'subtitles_words.json')
        const renamedSubPath = path.join(outputDir, '1_subtitles_words.json')
        if (fs.existsSync(subWordsPath)) fs.renameSync(subWordsPath, renamedSubPath)

        // Generate SRT
        const genSrt = spawn('node', [path.join(scriptsDir, 'generate_srt.js'), renamedSubPath], {
          cwd: outputDir,
          stdio: 'pipe',
        })

        genSrt.on('close', () => {
          // Extract transcript text
          try {
            const volcData = JSON.parse(fs.readFileSync(renamedPath, 'utf8'))
            const transcript = volcData.utterances.map(u => u.text).join('\n')
            fs.writeFileSync(path.join(outputDir, '4_transcript.txt'), transcript)
          } catch {}

          sendEvent('step', { step: 'subtitles', message: '✅ 字幕生成完成' })
          sendEvent('done', {
            outputDir: path.basename(outputDir),
            transcript: path.join(outputDir, '4_transcript.txt'),
          })
          res.end()
        })
      })
    })
  })

  req.on('close', () => {
    ffmpegAudio.kill('SIGTERM')
  })
})

// ─── Split: analyze chapters ────────────────────────────────────────────────
app.post('/api/split/analyze', (req, res) => {
  const { outputDir: dirName } = req.body
  if (!dirName) return res.status(400).json({ error: 'Missing outputDir' })

  const transcriptPath = path.join(OUTPUT_DIR, dirName, '4_transcript.txt')
  if (!fs.existsSync(transcriptPath)) {
    return res.status(404).json({ error: 'Transcript not found' })
  }

  const transcript = fs.readFileSync(transcriptPath, 'utf8')

  const prompt = `你是视频内容分析专家。分析以下转录稿，按话题自然转换点将其切分为多个章节。

要求：
- 每个章节 2-5 分钟
- 在话题自然转换处切分（不要机械按时间切）
- 确保覆盖所有内容，无遗漏
- 每个章节是一个相对独立的话题

输出严格 JSON 数组格式，不要代码围栏，不要解释：
[{"title": "章节标题(10-20字)", "start": "MM:SS", "end": "MM:SS", "summary": "1-2句摘要(50-100字)", "keywords": ["关键词1", "关键词2", "关键词3"]}]

转录稿：

${transcript}`

  const claude = spawn('claude', ['-p', '--dangerously-skip-permissions', '--output-format', 'text'], {
    cwd: ROOT_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let output = ''
  claude.stdout.on('data', (chunk) => { output += chunk.toString() })

  claude.stdin.write(prompt)
  claude.stdin.end()

  claude.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Claude analysis failed' })
    }

    // Strip code fences if present
    output = output.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '').trim()

    try {
      const chapters = JSON.parse(output)
      // Save to file
      fs.writeFileSync(
        path.join(OUTPUT_DIR, dirName, '4_chapters.json'),
        JSON.stringify(chapters, null, 2)
      )
      res.json({ chapters })
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse chapters', raw: output.slice(0, 500) })
    }
  })
})

// ─── Split: execute splits ──────────────────────────────────────────────────
app.post('/api/split/execute', async (req, res) => {
  const { outputDir: dirName, chapters, videoPath } = req.body
  if (!dirName || !chapters || !videoPath) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const dir = path.join(OUTPUT_DIR, dirName)
  const splitsDir = path.join(dir, 'splits')
  fs.mkdirSync(splitsDir, { recursive: true })

  const srtPath = path.join(dir, '1_subtitles.srt')
  const results = []

  const spawnSync = (await import('child_process')).spawnSync

  const runCmd = (cmd, args) => {
    const result = spawnSync(cmd, args, { stdio: 'pipe' })
    if (result.status !== 0) {
      throw new Error(result.stderr ? result.stderr.toString() : `${cmd} exited with code ${result.status}`)
    }
    return result
  }

  for (const chapter of chapters) {
    const safeTitle = chapter.title.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 30)
    const outputName = `split_${chapter.index}_${safeTitle}.mp4`
    const outputPath = path.join(splitsDir, outputName)

    // Parse time
    const parseTime = (t) => {
      const parts = t.split(':').map(Number)
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
      return parts[0] * 60 + parts[1]
    }

    const startSec = parseTime(chapter.start)
    const endSec = parseTime(chapter.end)
    const duration = endSec - startSec

    try {
      // Step 1: Cut video segment
      const tempPath = outputPath.replace('.mp4', '_nosub.mp4')

      runCmd('ffmpeg', ['-y', '-ss', String(startSec), '-i', videoPath, '-t', String(duration), '-c', 'copy', tempPath])

      // Step 2: Extract and offset SRT for this segment
      if (fs.existsSync(srtPath)) {
        const srtContent = fs.readFileSync(srtPath, 'utf8')
        const offsetSrt = offsetSubtitles(srtContent, startSec, endSec)
        const segSrtPath = outputPath.replace('.mp4', '.srt')
        fs.writeFileSync(segSrtPath, offsetSrt)

        // Step 3: Burn subtitles
        const subtitleFilter = `subtitles='${segSrtPath}':force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=30'`
        try {
          runCmd('ffmpeg', ['-y', '-i', tempPath, '-vf', subtitleFilter, '-c:a', 'copy', outputPath])
          fs.unlinkSync(tempPath)
          fs.unlinkSync(segSrtPath)
        } catch {
          // Fallback: use video without subtitles
          fs.renameSync(tempPath, outputPath)
        }
      } else {
        fs.renameSync(tempPath, outputPath)
      }

      results.push({ index: chapter.index, title: chapter.title, file: outputName, success: true })
    } catch (err) {
      results.push({ index: chapter.index, title: chapter.title, success: false, error: err.message })
    }
  }

  res.json({ results, splitsDir: `splits/` })
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
