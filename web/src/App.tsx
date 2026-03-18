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
