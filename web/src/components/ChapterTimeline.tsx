interface Chapter {
  title: string
  start: string
  end: string
}

interface Props {
  chapters: Chapter[]
  selected: Set<number>
  onToggle: (index: number) => void
}

const COLORS = [
  'bg-brand-accent',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-lime-500',
]

function parseTime(t: string): number {
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

export default function ChapterTimeline({ chapters, selected, onToggle }: Props) {
  if (chapters.length === 0) return null

  const totalEnd = Math.max(...chapters.map(c => parseTime(c.end)))

  return (
    <div className="glass-card p-4">
      <p className="section-label mb-3">Timeline</p>
      <div className="flex h-12 rounded-xl overflow-hidden gap-0.5">
        {chapters.map((ch, i) => {
          const start = parseTime(ch.start)
          const end = parseTime(ch.end)
          const widthPct = ((end - start) / totalEnd) * 100

          return (
            <div
              key={i}
              onClick={() => onToggle(i)}
              className={`
                relative cursor-pointer transition-opacity
                ${COLORS[i % COLORS.length]}
                ${selected.has(i) ? 'opacity-100' : 'opacity-20'}
              `}
              style={{ width: `${widthPct}%` }}
              title={`${ch.title} (${ch.start} - ${ch.end})`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-medium truncate px-1">
                {i + 1}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-gray-600">0:00</span>
        <span className="text-[10px] text-gray-600">
          {Math.floor(totalEnd / 60)}:{String(Math.floor(totalEnd % 60)).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}
