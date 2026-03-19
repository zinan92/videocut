interface Chapter {
  title: string
  start: string
  end: string
  summary: string
  keywords: string[]
}

interface Props {
  chapter: Chapter
  index: number
  selected: boolean
  onToggle: (index: number) => void
}

export default function ChapterCard({ chapter, index, selected, onToggle }: Props) {
  return (
    <div
      onClick={() => onToggle(index)}
      className={`
        glass-card-hover p-4 cursor-pointer transition-all
        ${selected
          ? 'border-brand-accent/30 bg-brand-accent/[0.06]'
          : ''}
      `}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(index)}
          className="mt-1 accent-brand-accent"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500 font-mono">
              {chapter.start} - {chapter.end}
            </span>
          </div>
          <h4 className="font-medium text-sm mb-1">{chapter.title}</h4>
          <p className="text-xs text-gray-400 line-clamp-2">{chapter.summary}</p>
          <div className="flex gap-1 mt-2 flex-wrap">
            {chapter.keywords.map((kw, i) => (
              <span key={i} className="text-xs bg-white/[0.04] text-gray-400 px-2 py-0.5 rounded-lg border border-white/[0.04]">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
