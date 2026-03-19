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
    addLog(`Uploading: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

    try {
      const { path: videoPath } = await uploadVideo(file)
      addLog(`Upload complete: ${videoPath}`)
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
              addLog(`Pipeline complete! Output: ${data.outputDir}`)
            } else {
              setStage('error')
              setErrorMsg(`Pipeline exit code: ${data.code}`)
            }
            break
        }
      }

      es.onerror = () => {
        es.close()
        setStage('error')
        setErrorMsg('Connection to server lost')
      }
    } catch (err) {
      setStage('error')
      setErrorMsg(String(err))
    }
  }

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

      {(stage === 'running' || stage === 'done' || stage === 'error') && (
        <div className="space-y-6">
          <div className="glass-card px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-sm text-gray-400">{fileName}</span>
          </div>

          <PhaseProgress phases={phases} logs={logs} elapsed={elapsed} />

          {stage === 'done' && (
            <div className="glass-card border-green-500/20 bg-green-500/[0.04] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-green-400 font-medium text-sm">Pipeline complete</span>
              </div>
              <button
                onClick={() => navigate(`/publish/${outputDir}`)}
                className="btn-primary"
              >
                View Output &amp; Publish →
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="glass-card border-red-500/20 bg-red-500/[0.04] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-400 text-sm">{errorMsg}</span>
              </div>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  )
}
