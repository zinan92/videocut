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

const STATUS_STYLES: Record<string, { dot: string; label: string; color: string }> = {
  pending:   { dot: 'bg-amber-400', label: 'Pending', color: 'text-amber-400' },
  published: { dot: 'bg-green-400', label: 'Published', color: 'text-green-400' },
  skipped:   { dot: 'bg-gray-500', label: 'Skipped', color: 'text-gray-500' },
  failed:    { dot: 'bg-red-400', label: 'Failed', color: 'text-red-400' },
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
    <div className="glass-card-hover p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{icon}</span>
          <h3 className="font-bold text-sm">{name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
          <span className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</span>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 mb-4">
        {previewLabel && (
          <p className="section-label mb-2">{previewLabel}</p>
        )}
        <div className="log-terminal !h-auto max-h-36 !text-[11px] !leading-relaxed">
          {previewContent.slice(0, 500)}
          {previewContent.length > 500 && <span className="text-gray-600">...</span>}
        </div>
      </div>

      {extraInfo && <div className="mb-4">{extraInfo}</div>}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleCopy} className="btn-ghost flex-1 text-xs">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost flex-1 text-xs text-center"
        >
          Open
        </a>
      </div>

      {status === 'pending' && (
        <button
          onClick={() => onStatusChange('published')}
          className="mt-2 w-full py-2 rounded-xl text-xs font-medium transition-all duration-200 text-brand-accent bg-brand-accent/[0.08] hover:bg-brand-accent/[0.15] border border-brand-accent/10"
        >
          Mark as Published
        </button>
      )}
    </div>
  )
}
