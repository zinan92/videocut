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
    addLog(`上传中: ${file.name}`)

    try {
      const form = new FormData()
      form.append('video', file)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      const { path: vPath } = await uploadRes.json()
      setVideoPath(vPath)
      addLog(`上传完成: ${vPath}`)

      // Start transcription
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
            addLog('转录完成，开始 AI 分析...')
            es.close()
            analyzeChapters(data.outputDir)
            break
        }
      }

      es.onerror = () => {
        es.close()
        setError('转录连接断开')
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
      addLog(`分析完成，共 ${data.chapters.length} 个章节`)
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
    addLog(`开始切割 ${selected.size} 个章节...`)

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
      addLog(`切割完成: ${successCount}/${data.results.length} 成功`)
    } catch (err) {
      setError(String(err))
      setStage('selecting')
    }
  }

  // Calculate selected duration
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
          <div className="text-4xl mb-4 animate-pulse">📤</div>
          <p>上传中: {fileName}</p>
        </div>
      )}

      {(stage === 'transcribing' || stage === 'analyzing') && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin text-brand-accent text-xl">⏳</div>
            <span className="font-medium">
              {stage === 'transcribing' ? 'Whisper 转录中...' : 'AI 分析章节中...'}
            </span>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 h-32 overflow-y-auto font-mono text-xs text-gray-400">
            {logs.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}

      {(stage === 'selecting' || stage === 'splitting') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              📊 共 {chapters.length} 个章节
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

          <div className="flex items-center justify-between bg-gray-900 rounded-lg p-4">
            <div className="text-sm text-gray-400">
              已选 <span className="text-white font-medium">{selected.size}</span> 个章节
              <span className="mx-2">·</span>
              约 {Math.floor(selectedDuration / 60)}分{Math.floor(selectedDuration % 60)}秒
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-gray-500 hover:text-white px-2 py-1">全选</button>
              <button onClick={selectNone} className="text-xs text-gray-500 hover:text-white px-2 py-1">全不选</button>
              <button
                onClick={executeSplit}
                disabled={selected.size === 0 || stage === 'splitting'}
                className="bg-brand-accent hover:bg-brand-accent/80 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {stage === 'splitting' ? '切割中...' : `执行切割 (${selected.size} 段) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
            <span className="text-green-400 font-medium">✅ 切割完成！</span>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.success ? 'bg-gray-900' : 'bg-red-900/20'}`}>
                <span>{r.success ? '✅' : '❌'}</span>
                <span className="text-sm font-medium">{r.title}</span>
                {r.file && <span className="text-xs text-gray-500 ml-auto">{r.file}</span>}
                {r.error && <span className="text-xs text-red-400 ml-auto">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            输出目录: output/{outputDir}/splits/
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
          <span className="text-red-400">❌ {error}</span>
          <button onClick={() => { setError(''); setStage('idle') }} className="ml-4 text-xs text-gray-500 hover:text-white">重试</button>
        </div>
      )}
    </div>
  )
}
