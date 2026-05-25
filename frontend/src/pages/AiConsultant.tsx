import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, RefreshCw, Download, FileText, Globe, File, ChevronRight, MessageSquare } from 'lucide-react'
import api from '../api/client'

// Chrome bug: CSS zoom on <html> breaks xterm.js mouse coordinates.
// Reset it while this page is mounted and restore on unmount.
function useDisableHtmlZoom() {
  useEffect(() => {
    const html = document.documentElement
    const saved = html.style.zoom
    html.style.zoom = ''
    return () => { html.style.zoom = saved }
  }, [])
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => execCopy(text))
  } else {
    execCopy(text)
  }
}

function execCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try { document.execCommand('copy') } catch { /**/ }
  document.body.removeChild(ta)
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'html' || ext === 'htm') return <Globe className="w-3.5 h-3.5 shrink-0 text-blue-400" />
  if (ext === 'txt' || ext === 'md')   return <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400" />
  return <File className="w-3.5 h-3.5 shrink-0 text-gray-400" />
}

const TERM_OPTIONS = {
  theme: {
    background: '#0f172a', foreground: '#e2e8f0', cursor: '#94a3b8',
    selectionBackground: '#334155', black: '#1e293b', brightBlack: '#475569',
    red: '#f87171', brightRed: '#fca5a5', green: '#4ade80', brightGreen: '#86efac',
    yellow: '#facc15', brightYellow: '#fde047', blue: '#60a5fa', brightBlue: '#93c5fd',
    magenta: '#c084fc', brightMagenta: '#d8b4fe', cyan: '#22d3ee', brightCyan: '#67e8f9',
    white: '#cbd5e1', brightWhite: '#f1f5f9',
  },
  fontFamily: '"Cascadia Code","Fira Code","JetBrains Mono",Menlo,Monaco,"Courier New",monospace',
  fontSize: 14,
  lineHeight: 1.4,
  cursorBlink: true,
  scrollback: 5000,
  allowTransparency: false,
}

type SessionData = {
  id: string
  label: string
  term: Terminal
  fit: FitAddon
  ws: WebSocket | null
  container: HTMLDivElement
}

type WorkspaceFile = { path: string; name: string; size: number; modified: number }

export default function AiConsultant() {
  useDisableHtmlZoom()

  const stackRef     = useRef<HTMLDivElement>(null)
  const sessionsRef  = useRef<Map<string, SessionData>>(new Map())
  const counterRef   = useRef(0)

  const [sessionIds, setSessionIds] = useState<string[]>([])
  const [activeId,   setActiveId]   = useState('')

  const [files,        setFiles]        = useState<WorkspaceFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  // ── File browser ───────────────────────────────────────────────────────────
  const refreshFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const { data } = await api.get<{ files: WorkspaceFile[] }>('/ai/workspace/files')
      setFiles(data.files)
    } catch { /**/ } finally { setFilesLoading(false) }
  }, [])

  const downloadFile = useCallback((path: string) => {
    const a = document.createElement('a')
    a.href = `/api/ai/workspace/file?path=${encodeURIComponent(path)}`
    a.download = path.split('/').pop() ?? path
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  // ── Session management ─────────────────────────────────────────────────────
  const activateSession = useCallback((id: string) => {
    for (const [sid, s] of sessionsRef.current) {
      s.container.style.visibility = sid === id ? 'visible' : 'hidden'
    }
    setActiveId(id)
    const s = sessionsRef.current.get(id)
    if (s) requestAnimationFrame(() => { s.fit.fit(); s.term.focus() })
  }, [])

  const connectSession = useCallback(async (sess: SessionData) => {
    sess.ws?.close()
    sess.ws = null
    sess.term.writeln('\x1b[90mConectando…\x1b[0m')
    try {
      const { data } = await api.post<{ ticket: string }>('/ai/terminal/ticket')
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ai/terminal/ws?ticket=${data.ticket}`)
      ws.binaryType = 'arraybuffer'
      sess.ws = ws
      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) sess.term.write(new Uint8Array(e.data))
        else sess.term.write(e.data as string)
      }
      ws.onclose = () => sess.term.writeln('\r\n\x1b[33m[Sesión cerrada]\x1b[0m')
      ws.onerror = () => sess.term.writeln('\r\n\x1b[31m[Error de conexión]\x1b[0m')
    } catch {
      sess.term.writeln('\r\n\x1b[31m[No se pudo conectar]\x1b[0m')
    }
  }, [])

  const createSession = useCallback(() => {
    if (!stackRef.current) return
    counterRef.current++
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const label = `Sesión ${counterRef.current}`

    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;inset:0;visibility:hidden'
    stackRef.current.appendChild(container)

    const term = new Terminal(TERM_OPTIONS)
    const fit  = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    requestAnimationFrame(() => fit.fit())

    // Copy / paste
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true
      if (e.code === 'KeyC') {
        const sel = term.getSelection()
        if (sel) copyToClipboard(sel)
        return false
      }
      if (e.code === 'KeyV') {
        navigator.clipboard.readText().then(t => { if (t) term.paste(t) }).catch(() => {})
        return false
      }
      return true
    })

    let lastSel = ''
    term.onSelectionChange(() => { const s = term.getSelection(); if (s) lastSel = s })

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const sel = term.getSelection() || lastSel
      if (sel) { copyToClipboard(sel); lastSel = ''; term.clearSelection(); return }
      navigator.clipboard.readText().then(t => { if (t) term.paste(t) }).catch(() => {
        const ta = document.createElement('textarea')
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px'
        document.body.appendChild(ta)
        ta.addEventListener('paste', (pe) => {
          pe.preventDefault()
          const t = pe.clipboardData?.getData('text/plain') ?? ''
          document.body.removeChild(ta)
          if (t) term.paste(t)
          term.focus()
        }, { once: true })
        ta.focus()
        document.execCommand('paste')
      })
    })

    term.onData((d) => { const s = sessionsRef.current.get(id); if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send(d) })
    term.onResize(({ cols, rows }) => { const s = sessionsRef.current.get(id); if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send(`resize:${cols}:${rows}`) })

    const sess: SessionData = { id, label, term, fit, ws: null, container }
    sessionsRef.current.set(id, sess)
    setSessionIds(prev => [...prev, id])
    activateSession(id)
    connectSession(sess).then(() => term.focus())
  }, [activateSession, connectSession])

  const closeSession = useCallback((id: string) => {
    const sess = sessionsRef.current.get(id)
    if (!sess) return
    sess.ws?.close()
    sess.term.dispose()
    sess.container.remove()
    sessionsRef.current.delete(id)
    setSessionIds(prev => {
      const next = prev.filter(s => s !== id)
      if (next.length > 0) activateSession(next[next.length - 1])
      else setActiveId('')
      return next
    })
  }, [activateSession])

  // Auto-focus when returning to tab after OAuth
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === 'visible' && activeId) {
        sessionsRef.current.get(activeId)?.term.focus()
      }
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [activeId])

  // Resize observer for active terminal
  useEffect(() => {
    if (!stackRef.current) return
    const ro = new ResizeObserver(() => {
      if (activeId) sessionsRef.current.get(activeId)?.fit.fit()
    })
    ro.observe(stackRef.current)
    return () => ro.disconnect()
  }, [activeId])

  // First session + initial file list
  useEffect(() => {
    createSession()
    refreshFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup all on unmount
  useEffect(() => () => {
    for (const s of sessionsRef.current.values()) { s.ws?.close(); s.term.dispose() }
    sessionsRef.current.clear()
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-44 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">

        {/* Header */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Consultor IA
          </p>
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva sesión
          </button>
        </div>

        {/* Session tabs */}
        <div className="flex-1 overflow-y-auto min-h-0 py-0.5">
          {sessionIds.map(id => {
            const sess = sessionsRef.current.get(id)
            if (!sess) return null
            const active = id === activeId
            return (
              <div
                key={id}
                onClick={() => activateSession(id)}
                className={`group flex items-center gap-1 px-2 py-1.5 mx-1 my-0.5 rounded-md cursor-pointer text-xs transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {active
                  ? <ChevronRight className="w-3 h-3 shrink-0" />
                  : <MessageSquare className="w-3 h-3 shrink-0 opacity-40" />
                }
                <span className="flex-1 truncate">{sess.label}</span>
                {sessionIds.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeSession(id) }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-auto shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* File browser */}
        <div className="border-t border-gray-200 dark:border-gray-800 flex flex-col shrink-0" style={{ maxHeight: '45%' }}>
          <div className="flex items-center justify-between px-3 py-2 shrink-0">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Archivos
            </span>
            <button
              onClick={refreshFiles}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-3 h-3 ${filesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-y-auto pb-1 min-h-0">
            {files.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 px-3 py-1 italic">
                Sin archivos
              </p>
            ) : (
              files.map(f => (
                <button
                  key={f.path}
                  onClick={() => downloadFile(f.path)}
                  title={`${f.path}  ·  ${fmtSize(f.size)}`}
                  className="group w-full flex items-center gap-1.5 px-2 py-1 mx-0.5 rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  style={{ maxWidth: 'calc(100% - 4px)' }}
                >
                  <FileIcon name={f.name} />
                  <span className="flex-1 truncate">{f.name}</span>
                  <Download className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Terminal stack ── */}
      <div
        ref={stackRef}
        className="flex-1 relative"
        style={{ background: '#0f172a' }}
      />
    </div>
  )
}
