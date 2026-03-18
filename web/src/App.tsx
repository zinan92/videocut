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
