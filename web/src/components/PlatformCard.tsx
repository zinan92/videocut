import { useState } from 'react'

interface Props {
  name: string
  icon: string
  status: string
  previewContent: string
  previewLabel?: string
  extraInfo?: React.ReactNode
  copyContent: string
  openUrl: string
  onStatusChange: (status: string) => void
}

const STATUS_STYLES: Record<string, { icon: string; label: string; color: string }> = {
  pending:   { icon: '⏳', label: '待发布', color: 'text-yellow-400' },
  published: { icon: '✅', label: '已发布', color: 'text-green-400' },
  skipped:   { icon: '⏭', label: '已跳过', color: 'text-gray-500' },
  failed:    { icon: '❌', label: '失败', color: 'text-red-400' },
}

export default function PlatformCard({
  name, icon, status, previewContent, previewLabel,
  extraInfo, copyContent, openUrl, onStatusChange
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusInfo = STATUS_STYLES[status] || STATUS_STYLES.pending

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">
          <span className="mr-2">{icon}</span>{name}
        </h3>
        <span className={`text-sm ${statusInfo.color}`}>
          {statusInfo.icon} {statusInfo.label}
        </span>
      </div>

      {/* Preview */}
      <div className="flex-1 mb-4">
        {previewLabel && (
          <p className="text-xs text-gray-500 mb-1">{previewLabel}</p>
        )}
        <div className="bg-gray-950 rounded-lg p-3 text-sm text-gray-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {previewContent.slice(0, 500)}
          {previewContent.length > 500 && <span className="text-gray-600">...</span>}
        </div>
      </div>

      {extraInfo && <div className="mb-4">{extraInfo}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 px-3 rounded-lg transition-colors"
        >
          {copied ? '✅ 已复制' : '📋 复制内容'}
        </button>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 px-3 rounded-lg transition-colors text-center"
        >
          🌐 打开平台
        </a>
      </div>

      {/* Mark as published */}
      {status === 'pending' && (
        <button
          onClick={() => onStatusChange('published')}
          className="mt-2 w-full bg-brand-accent/20 hover:bg-brand-accent/30 text-brand-accent text-sm py-2 rounded-lg transition-colors"
        >
          标记为已发布
        </button>
      )}
    </div>
  )
}
