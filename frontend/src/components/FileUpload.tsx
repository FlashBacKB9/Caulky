import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import {
  Paperclip, Image as ImageIcon, FileText, BarChart2, X, AlertTriangle,
  ArrowLeft, ZoomIn, ZoomOut, Download,
} from 'lucide-react'
import { t } from '../utils/i18n'

const WARN_BYTES = 20 * 1024 * 1024

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

// ── File viewer (lightbox) ────────────────────────────────────────────────────

function FileViewer({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isImage = file.mime_type.startsWith('image/')
  const isPDF   = file.mime_type === 'application/pdf'

  useEffect(() => {
    let url = ''
    api.get(`/movements/files/${file.id}/download`, { responseType: 'blob' })
      .then(res => {
        url = URL.createObjectURL(new Blob([res.data], { type: file.mime_type }))
        setBlobUrl(url)
      })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file.id, file.mime_type])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const zoomIn  = () => setZoom(z => Math.min(4, +(z + 0.5).toFixed(1)))
  const zoomOut = () => setZoom(z => Math.max(0.25, +(z - 0.5).toFixed(1)))

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col bg-black/95">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-900 border-b border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
          title="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <span className="flex-1 text-sm text-gray-300 truncate">{file.original_name}</span>

        <div className="flex items-center gap-0.5">
          {isImage && (
            <>
              <button
                onClick={zoomOut}
                disabled={zoom <= 0.25}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-white/10"
                title="Reducir"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white tabular-nums min-w-[52px] text-center rounded-lg hover:bg-white/10 transition-colors"
                title="Restablecer zoom"
              >
                {zoom === 1 ? 'ajuste' : `${Math.round(zoom * 100)}%`}
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= 4}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded-lg hover:bg-white/10"
                title="Ampliar"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
            </>
          )}
          <a
            href={`/api/movements/files/${file.id}/download`}
            download={file.original_name}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            title="Descargar"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
      >
        {!blobUrl ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-gray-500 text-sm">Cargando…</span>
          </div>
        ) : isImage ? (
          <div className={`min-h-full flex items-center justify-center ${zoom === 1 ? 'p-4' : 'p-10'}`}>
            <img
              src={blobUrl}
              alt={file.original_name}
              onClick={() => setZoom(z => z === 1 ? 2 : 1)}
              style={
                zoom === 1
                  ? { maxWidth: '100%', maxHeight: 'calc(100vh - 56px)', objectFit: 'contain', cursor: 'zoom-in' }
                  : { width: `${zoom * 80}vw`, maxWidth: 'none', height: 'auto', cursor: 'zoom-out' }
              }
              draggable={false}
            />
          </div>
        ) : isPDF ? (
          <iframe
            src={blobUrl}
            title={file.original_name}
            className="w-full border-0"
            style={{ height: 'calc(100vh - 48px)' }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
            <FileText className="w-12 h-12 opacity-20" strokeWidth={1} />
            <p className="text-sm">Vista previa no disponible para este tipo de archivo</p>
            <a
              href={`/api/movements/files/${file.id}/download`}
              download={file.original_name}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Descargar archivo
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── FileUpload ────────────────────────────────────────────────────────────────

export default function FileUpload({ movementId, existingFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pendingLarge, setPendingLarge] = useState<File[] | null>(null)
  const [viewing, setViewing] = useState<FileRecord | null>(null)
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

  const handle = (files: FileList | File[] | null) => {
    if (!files || !files.length) return
    const arr = Array.from(files)
    const large = arr.filter(f => f.size > WARN_BYTES)
    if (large.length > 0) {
      setPendingLarge(arr)
    } else {
      upload.mutate(arr)
    }
  }

  // Pegar archivos desde el portapapeles (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) { e.preventDefault(); handle(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div className="space-y-2">
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}

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
              <button
                onClick={() => setViewing(f)}
                className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white max-w-[160px] truncate text-left"
                title={f.original_name}
              >
                {f.original_name}
              </button>
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
          {upload.isPending ? 'Subiendo...' : 'Arrastra, pega con Ctrl+V o haz clic para seleccionar'}
        </span>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => handle(e.target.files)} />
      </div>
    </div>
  )
}
