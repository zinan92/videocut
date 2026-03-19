import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import PipelinePage from './pages/PipelinePage'
import PublishPage from './pages/PublishPage'
import SplitPage from './pages/SplitPage'

function HomePage() {
  const [tab, setTab] = useState<'pipeline' | 'split'>('pipeline')

  return (
    <div className="min-h-screen">
      {/* Gradient orb background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-brand-accent/[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-blue-500/[0.03] blur-[100px]" />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-accent to-pink-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-brand-accent/20">V</div>
            <h1 className="text-2xl font-bold tracking-tight">Videocut</h1>
          </div>
          <p className="text-gray-500 text-sm">Upload a video. Get content for every platform.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 glass-card p-1.5">
          <button
            onClick={() => setTab('pipeline')}
            className={`tab-pill ${tab === 'pipeline' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
          >
            Single Video
          </button>
          <button
            onClick={() => setTab('split')}
            className={`tab-pill ${tab === 'split' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
          >
            Split Long Video
          </button>
        </div>

        {tab === 'pipeline' ? <PipelinePage /> : <SplitPage />}
      </div>
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
