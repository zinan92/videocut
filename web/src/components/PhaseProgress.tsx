interface Phase {
  number: number
  name: string
  status: 'pending' | 'active' | 'done'
}

interface Props {
  phases: Phase[]
  logs: string[]
  elapsed?: string
}

export default function PhaseProgress({ phases, logs, elapsed }: Props) {
  return (
    <div className="space-y-6">
      {/* Phase bars */}
      <div className="space-y-3">
        {phases.map((p) => (
          <div key={p.number} className="flex items-center gap-3">
            <span className="w-6 text-center">
              {p.status === 'done' ? '✅' : p.status === 'active' ? '⏳' : '○'}
            </span>
            <span className={`text-sm font-medium w-48 ${p.status === 'active' ? 'text-brand-accent' : p.status === 'done' ? 'text-green-400' : 'text-gray-600'}`}>
              Phase {p.number}: {p.name}
            </span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  p.status === 'done' ? 'w-full bg-green-500' :
                  p.status === 'active' ? 'w-1/2 bg-brand-accent animate-pulse' :
                  'w-0'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {elapsed && (
        <p className="text-sm text-gray-500">耗时: {elapsed}</p>
      )}

      {/* Log output */}
      <div className="bg-gray-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-gray-400">
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
