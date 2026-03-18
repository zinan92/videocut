const BASE = ''

export async function uploadVideo(file: File): Promise<{ path: string; name: string }> {
  const form = new FormData()
  form.append('video', file)
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export function startPipeline(videoPath: string): EventSource {
  return new EventSource(`${BASE}/api/pipeline/start?video=${encodeURIComponent(videoPath)}`)
}

export async function listOutputs(): Promise<Array<{ name: string; manifest: unknown }>> {
  const res = await fetch(`${BASE}/api/outputs`)
  return res.json()
}

export async function getOutput(dir: string) {
  const res = await fetch(`${BASE}/api/outputs/${encodeURIComponent(dir)}`)
  if (!res.ok) throw new Error('Not found')
  return res.json()
}

export function fileUrl(dir: string, name: string): string {
  return `${BASE}/api/outputs/${encodeURIComponent(dir)}/file/${encodeURIComponent(name)}`
}

export async function updatePublishStatus(dir: string, platform: string, status: string) {
  const res = await fetch(`${BASE}/api/outputs/${encodeURIComponent(dir)}/publish/${platform}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return res.json()
}
