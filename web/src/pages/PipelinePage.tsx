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
