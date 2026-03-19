import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import PipelinePage from './pages/PipelinePage'
import PublishPage from './pages/PublishPage'
import SplitPage from './pages/SplitPage'

function HomePage() {
  const [tab, setTab] = useState<'pipeline' | 'split'>('pipeline')

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">🎬 Videocut Dashboard</h1>
      <p className="text-gray-500 mb-6">上传视频 → 自动生成多平台内容 → 一键发布</p>

      <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1">
        <button
          onClick={() => setTab('pipeline')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'pipeline' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          单条口播处理
        </button>
        <button
          onClick={() => setTab('split')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'split' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          长视频拆条
        </button>
      </div>

      {tab === 'pipeline' ? <PipelinePage /> : <SplitPage />}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/publish/:dir" element={<PublishPage />} />
    </Routes>
  )
}
