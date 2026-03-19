import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PlatformCard from '../components/PlatformCard'
import { getOutput, fileUrl, updatePublishStatus } from '../lib/api'

interface OutputData {
  name: string
  manifest: { platforms: Record<string, { status: string }> } | null
  content: {
    video_meta: { title_cn: string; hook: { cn: string }; tags_cn: string[] } | null
    xhs_caption: string | null
    wechat_article: string | null
    x_thread: Array<{ tweet: string; position: number }> | null
    x_post: string | null
  }
  cards: string[]
  hasVideo: boolean
  hasThumbnail: boolean
}

const PLATFORM_URLS: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  xhs: 'https://creator.xiaohongshu.com/publish/publish',
  wechat: 'https://mp.weixin.qq.com/',
  x_thread: 'https://x.com/compose/post',
}

export default function PublishPage() {
  const { dir } = useParams<{ dir: string }>()
  const [data, setData] = useState<OutputData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dir) return
    getOutput(dir)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [dir])

  const getStatus = (platform: string) =>
    data?.manifest?.platforms?.[platform]?.status || 'pending'

  const handleStatusChange = async (platform: string, status: string) => {
    if (!dir) return
    await updatePublishStatus(dir, platform, status)
    const updated = await getOutput(dir)
    setData(updated)
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error) return <div className="p-8 text-red-400">{error}</div>
  if (!data) return <div className="p-8 text-gray-500">No data found</div>

  const meta = data.content.video_meta
  const title = meta?.title_cn || dir || ''
  const hook = meta?.hook?.cn || ''
  const tags = (meta?.tags_cn || []).join(' ')

  return (
    <div className="min-h-screen">
      {/* Gradient orb background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-brand-accent/[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-blue-500/[0.03] blur-[100px]" />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/" className="btn-ghost inline-block mb-4">← Back</Link>
            <h1 className="text-2xl font-bold">Content Distribution</h1>
            <p className="text-gray-500 mt-1 text-sm">{dir}</p>
          </div>
          {data.hasThumbnail && (
            <img
              src={fileUrl(dir!, '4_thumbnail.png')}
              alt="thumbnail"
              className="w-32 h-20 object-cover rounded-2xl shadow-lg"
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Douyin */}
          <PlatformCard
            name="抖音"
            icon="📱"
            status={getStatus('douyin')}
            previewContent={`标题: ${title}\nHook: ${hook}\n标签: ${tags}`}
            previewLabel="视频元数据"
            copyContent={title}
            openUrl={PLATFORM_URLS.douyin}
            onStatusChange={(s) => handleStatusChange('douyin', s)}
            extraInfo={
              data.hasVideo ? (
                <p className="text-xs text-gray-500">Video file: 3_output_cut.mp4</p>
              ) : null
            }
          />

          {/* XHS */}
          <PlatformCard
            name="小红书"
            icon="📕"
            status={getStatus('xhs')}
            previewContent={data.content.xhs_caption || '(no caption)'}
            previewLabel="小红书文案"
            copyContent={data.content.xhs_caption || ''}
            openUrl={PLATFORM_URLS.xhs}
            onStatusChange={(s) => handleStatusChange('xhs', s)}
            extraInfo={
              data.cards.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto">
                  {data.cards.map(c => (
                    <img
                      key={c}
                      src={fileUrl(dir!, c)}
                      alt={c}
                      className="w-16 h-16 rounded object-cover flex-shrink-0"
                    />
                  ))}
                </div>
              ) : null
            }
          />

          {/* WeChat */}
          <PlatformCard
            name="公众号"
            icon="💬"
            status={getStatus('wechat')}
            previewContent={data.content.wechat_article || '(no article)'}
            previewLabel="公众号文章"
            copyContent={data.content.wechat_article || ''}
            openUrl={PLATFORM_URLS.wechat}
            onStatusChange={(s) => handleStatusChange('wechat', s)}
          />

          {/* X/Twitter */}
          <PlatformCard
            name="X / Twitter"
            icon="🐦"
            status={getStatus('x_thread')}
            previewContent={
              data.content.x_thread
                ? data.content.x_thread.map((t, i) => `${i + 1}. ${t.tweet}`).join('\n\n')
                : data.content.x_post || '(no post)'
            }
            previewLabel={data.content.x_thread ? `Thread (${data.content.x_thread.length} tweets)` : 'Post'}
            copyContent={
              data.content.x_thread
                ? data.content.x_thread[0]?.tweet || ''
                : data.content.x_post || ''
            }
            openUrl={PLATFORM_URLS.x_thread}
            onStatusChange={(s) => handleStatusChange('x_thread', s)}
          />
        </div>
      </div>
    </div>
  )
}
