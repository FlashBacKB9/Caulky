import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import { Paperclip, Image as ImageIcon, FileText, BarChart2, X, AlertTriangle } from 'lucide-react'
import { t } from '../utils/i18n'

const WARN_BYTES = 20 * 1024 * 1024 // 20 MB

function fmt(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`
}

interface FileRecord {
  id: number
  original_name: string
  mime_type: string
}

interface Props {
  movementId: number
  existingFiles: FileRecord[]
}

function FileTypeIcon({ mime }: { mime: string }) {
  const cls = 'w-4 h-4 text-gray-500 shrink-0'
  if (mime.startsWith('image/')) return <ImageIcon className={cls} strokeWidth={1.5} />
  if (mime === 'application/pdf') return <FileText className={cls} strokeWidth={1.5} />
  if (mime.includes('spreadsheet') || mime.includes('excel')) return <BarChart2 className={cls} strokeWidth={1.5} />
  if (mime.includes('word') || mime.includes('document')) return <FileText className={cls} strokeWidth={1.5} />
  return <Paperclip className={cls} strokeWidth={1.5} />
}

export default function FileUpload({ movementId, existingFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pendingLarge, setPendingLarge] = useState<File[] | null>(null)
  const qc = useQueryClient()

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      await api.post(`/movements/${movementId}/files`, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movements'] }),
  })

  const remove = useMutation({
    mutationFn: (fileId: number) => api.delete(`/movements/files/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movements'] }),
  })

  const handle = (files: FileList | null) => {
    if (!files || !files.length) return
    const arr = Array.from(files)
    const large = arr.filter(f => f.size > WARN_BYTES)
    if (large.length > 0) {
      setPendingLarge(arr)
    } else {
      upload.mutate(arr)
    }
  }

  return (
    <div className="space-y-2">
      {pendingLarge && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('fileupload.largeFile')}</p>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-0.5">
                {pendingLarge.filter(f => f.size > WARN_BYTES).map(f => (
                  <li key={f.name}>{f.name} — <strong>{fmt(f.size)}</strong></li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500 pt-1">
                {t('fileupload.largeDesc')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setPendingLarge(null); if (inputRef.current) inputRef.current.value = '' }}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => { upload.mutate(pendingLarge); setPendingLarge(null) }}
              className="text-sm px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
            >
              {t('fileupload.uploadAnyway')}
            </button>
          </div>
        </div>
      )}
      {existingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {existingFiles.map(f => (
            <div key={f.id} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-sm group">
              <FileTypeIcon mime={f.mime_type} />
              <a
                href={`/api/movements/files/${f.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white max-w-[160px] truncate"
                title={f.original_name}
              >
                {f.original_name}
              </a>
              <button
                onClick={() => remove.mutate(f.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all ml-1"
                title="Eliminar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-gray-400 bg-gray-50 dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <span className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-gray-500">
          <Paperclip className="w-4 h-4" strokeWidth={1.5} />
          {upload.isPending ? 'Subiendo...' : 'Arrastra archivos aquí o haz clic para seleccionar'}
        </span>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => handle(e.target.files)} />
      </div>
    </div>
  )
}
