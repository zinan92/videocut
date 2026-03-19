import { useCallback, useState } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export default function FileUpload({ onFileSelected, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        glass-card-hover rounded-2xl p-16 text-center cursor-pointer
        transition-all duration-300 group
        ${dragOver ? 'border-brand-accent/40 bg-brand-accent/[0.06] scale-[1.01]' : ''}
        ${disabled ? 'opacity-40 pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
        id="video-upload"
        disabled={disabled}
      />
      <label htmlFor="video-upload" className="cursor-pointer block">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-accent/20 to-pink-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <svg className="w-7 h-7 text-brand-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className="text-base font-medium text-gray-200 mb-1">Drop your video here</p>
        <p className="text-sm text-gray-500">or click to browse — MP4, MOV</p>
      </label>
    </div>
  )
}
