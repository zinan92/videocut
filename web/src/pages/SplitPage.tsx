import { useState } from 'react'
import FileUpload from '../components/FileUpload'
import ChapterTimeline from '../components/ChapterTimeline'
import ChapterCard from '../components/ChapterCard'

interface Chapter {
  title: string
  start: string
  end: string
  summary: string
  keywords: string[]
}

interface SplitResult {
  index: number
  title: string
  file?: string
  success: boolean
  error?: string
}

type Stage = 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'selecting' | 'splitting' | 'done'

export default function SplitPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [results, setResults] = useState<SplitResult[]>([])
  const [error, setError] = useState('')

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-100), msg])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setStage('uploading')
    addLog(`Uploading: ${file.name}`)

    try {
      const form = new FormData()
      form.append('video', file)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      const { path: vPath } = await uploadRes.json()
      setVideoPath(vPath)
      addLog(`Upload complete: ${vPath}`)

      setStage('transcribing')
      const es = new EventSource(`/api/split/transcribe?video=${encodeURIComponent(vPath)}`)

      es.onmessage = (event) => {
        const data = JSON.parse(event.data)
        switch (data.type) {
          case 'step':
            addLog(data.message)
            break
          case 'log':
            addLog(data.message)
            break
          case 'error':
            setError(data.message)
            setStage('idle')
            es.close()
            break
          case 'done':
            setOutputDir(data.outputDir)
            addLog('Transcription complete, starting AI analysis...')
            es.close()
            analyzeChapters(data.outputDir)
            break
        }
      }

      es.onerror = () => {
        es.close()
        setError('Transcription connection lost')
        setStage('idle')
      }
    } catch (err) {
      setError(String(err))
      setStage('idle')
    }
  }

  const analyzeChapters = async (dirName: string) => {
    setStage('analyzing')
    try {
      const res = await fetch('/api/split/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputDir: dirName }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setStage('idle')
        return
      }
      setChapters(data.chapters)
      setSelected(new Set(data.chapters.map((_: Chapter, i: number) => i)))
      setStage('selecting')
      addLog(`Analysis complete — ${data.chapters.length} chapters found`)
    } catch (err) {
      setError(String(err))
      setStage('idle')
    }
  }

  const toggleChapter = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(chapters.map((_, i) => i)))
  const selectNone = () => setSelected(new Set())

  const executeSplit = async () => {
    setStage('splitting')
    addLog(`Splitting ${selected.size} chapters...`)

    const selectedChapters = chapters
      .map((ch, i) => ({ ...ch, index: i + 1 }))
      .filter((_, i) => selected.has(i))

    try {
      const res = await fetch('/api/split/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputDir: outputDir,
          chapters: selectedChapters,
          videoPath: videoPath,
        }),
      })
      const data = await res.json()
      setResults(data.results)
      setStage('done')

      const successCount = data.results.filter((r: SplitResult) => r.success).length
      addLog(`Split complete: ${successCount}/${data.results.length} successful`)
    } catch (err) {
      setError(String(err))
      setStage('selecting')
    }
  }

  const selectedDuration = chapters
    .filter((_, i) => selected.has(i))
    .reduce((sum, ch) => {
      const parseTime = (t: string) => {
        const parts = t.split(':').map(Number)
        return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
      }
      return sum + parseTime(ch.end) - parseTime(ch.start)
    }, 0)

  return (
    <div className="space-y-6">
      {stage === 'idle' && (
        <FileUpload onFileSelected={handleFile} />
      )}

      {stage === 'uploading' && (
        <div className="text-center py-12">
          <div className="flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-brand-accent animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium">Uploading {fileName}</p>
        </div>
      )}

      {(stage === 'transcribing' || stage === 'analyzing') && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-brand-accent animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="font-medium text-sm">
              {stage === 'transcribing' ? 'Whisper transcribing...' : 'AI analyzing chapters...'}
            </span>
          </div>
          <div className="log-terminal h-32">
            {logs.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}

      {(stage === 'selecting' || stage === 'splitting') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">
              {chapters.length} chapters found
            </h2>
            <span className="text-sm text-gray-500">{fileName}</span>
          </div>

          <ChapterTimeline chapters={chapters} selected={selected} onToggle={toggleChapter} />

          <div className="space-y-2">
            {chapters.map((ch, i) => (
              <ChapterCard
                key={i}
                chapter={ch}
                index={i}
                selected={selected.has(i)}
                onToggle={toggleChapter}
              />
            ))}
          </div>

          <div className="glass-card flex items-center justify-between px-5 py-4">
            <div className="text-sm text-gray-400">
              <span className="text-white font-medium">{selected.size}</span> chapters selected
              <span className="mx-2 text-gray-600">·</span>
              {Math.floor(selectedDuration / 60)}m {Math.floor(selectedDuration % 60)}s
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={selectAll} className="btn-ghost text-xs">Select all</button>
              <button onClick={selectNone} className="btn-ghost text-xs">None</button>
              <button
                onClick={executeSplit}
                disabled={selected.size === 0 || stage === 'splitting'}
                className="btn-primary"
              >
                {stage === 'splitting' ? 'Splitting...' : `Split ${selected.size} clips →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <div className="glass-card border-green-500/20 bg-green-500/[0.04] px-5 py-4 flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-400 font-medium text-sm">Split complete!</span>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${r.success ? 'glass-card' : 'bg-red-900/20 border border-red-500/20 rounded-xl'}`}>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.success ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm font-medium">{r.title}</span>
                {r.file && <span className="text-xs text-gray-500 ml-auto font-mono">{r.file}</span>}
                {r.error && <span className="text-xs text-red-400 ml-auto">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="section-label">
            Output: output/{outputDir}/splits/
          </p>
        </div>
      )}

      {error && (
        <div className="glass-card border-red-500/20 bg-red-500/[0.04] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button onClick={() => { setError(''); setStage('idle') }} className="btn-ghost text-xs">Retry</button>
        </div>
      )}
    </div>
  )
}
