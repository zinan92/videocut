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
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-200
        ${dragOver ? 'border-brand-accent bg-brand-accent/10' : 'border-gray-700 hover:border-gray-500'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
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
      <label htmlFor="video-upload" className="cursor-pointer">
        <div className="text-4xl mb-4">📹</div>
        <p className="text-lg font-medium">拖拽视频文件到这里</p>
        <p className="text-gray-500 mt-2">或点击选择文件 (MP4, MOV)</p>
      </label>
    </div>
  )
}
