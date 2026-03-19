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
    <div className="space-y-5">
      {/* Phase steps */}
      <div className="glass-card p-5 space-y-1">
        {phases.map((p) => (
          <div key={p.number} className="flex items-center gap-3 py-2">
            <div className={`phase-number ${
              p.status === 'done' ? 'bg-green-500/20 text-green-400' :
              p.status === 'active' ? 'bg-brand-accent/20 text-brand-accent' :
              'bg-white/[0.04] text-gray-600'
            }`}>
              {p.status === 'done' ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                p.number
              )}
            </div>
            <span className={`text-sm font-medium flex-1 ${
              p.status === 'active' ? 'text-brand-accent' :
              p.status === 'done' ? 'text-gray-300' :
              'text-gray-600'
            }`}>
              {p.name}
            </span>
            <div className="w-28 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ease-out ${
                p.status === 'done' ? 'w-full bg-green-500' :
                p.status === 'active' ? 'w-2/3 bg-brand-accent animate-pulse' :
                'w-0'
              }`} />
            </div>
          </div>
        ))}
      </div>

      {elapsed && (
        <p className="section-label text-center">{elapsed}</p>
      )}

      {/* Log terminal */}
      <div className="log-terminal h-44">
        {logs.map((line, i) => (
          <div key={i} className={i === logs.length - 1 ? 'text-gray-300' : ''}>{line}</div>
        ))}
      </div>
    </div>
  )
}
