import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, RefreshCw, Download, FileText, Globe, File, ChevronRight, MessageSquare, Pencil, Eye, Settings, Upload } from 'lucide-react'
import api from '../api/client'
import { syncPref } from '../utils/prefSync'

function useTerminalZoom(): string {
  // xterm.js mismeasures when html has a CSS zoom, so we clear it for this page.
  // Return the saved value so callers can re-apply it to non-terminal elements.
  const [savedZoom, setSavedZoom] = useState('')
  useEffect(() => {
    const html = document.documentElement
    const current = html.style.zoom
    setSavedZoom(current)
    html.style.zoom = ''
    return () => { html.style.zoom = current }
  }, [])
  return savedZoom
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

function generateId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
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

type Tab =
  | { kind: 'term'; id: string; label: string }
  | { kind: 'html'; id: string; label: string; src: string }

type WorkspaceFile = { path: string; name: string; size: number; modified: number }

const TABS_STORAGE_KEY  = 'ai-tab-names'
const WRITE_PERMS_KEY   = 'ai-write-perms'

type WritePerms = { create: boolean; edit: boolean; delete: boolean }

function loadSavedNames(): string[] {
  try { return JSON.parse(localStorage.getItem(TABS_STORAGE_KEY) ?? '[]') } catch { return [] }
}

function loadWritePerms(): WritePerms {
  try {
    const raw = localStorage.getItem(WRITE_PERMS_KEY)
    if (!raw) return { create: false, edit: false, delete: false }
    return { create: false, edit: false, delete: false, ...JSON.parse(raw) }
  } catch { return { create: false, edit: false, delete: false } }
}

function saveTabs(tabs: Tab[]) {
  const names = tabs.filter(t => t.kind === 'term').map(t => t.label)
  if (names.length > 0) syncPref(TABS_STORAGE_KEY, JSON.stringify(names))
}

export default function AiConsultant() {
  const panelZoom = useTerminalZoom()

  const stackRef    = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef<Map<string, SessionData>>(new Map())
  const counterRef  = useRef(0)

  const [tabs,      setTabs]      = useState<Tab[]>([])
  const [activeId,  setActiveId]  = useState('')
  const [editingId, setEditingId] = useState('')
  const editingIdRef = useRef('')   // ref so activateTab RAF can read latest value

  const [files,          setFiles]          = useState<WorkspaceFile[]>([])
  const [filesLoading,   setFilesLoading]   = useState(false)
  const [uploading,      setUploading]      = useState(false)
  const [writePerms,     setWritePerms]     = useState<WritePerms>(loadWritePerms)
  const [showPerms,      setShowPerms]      = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // ── File browser ─────────────────────────────────────────────────────────────
  const refreshFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const { data } = await api.get<{ files: WorkspaceFile[] }>('/ai/workspace/files')
      setFiles(data.files)
    } catch { /**/ } finally { setFilesLoading(false) }
  }, [])

  const uploadContextFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await api.post('/ai/workspace/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshFiles()
    } catch { /**/ } finally { setUploading(false) }
  }, [refreshFiles])

  const downloadFile = useCallback((path: string) => {
    const a = document.createElement('a')
    a.href = `/api/ai/workspace/file?path=${encodeURIComponent(path)}`
    a.download = path.split('/').pop() ?? path
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  const toggleWritePerm = useCallback((key: keyof WritePerms) => {
    setWritePerms(prev => {
      const next = { ...prev, [key]: !prev[key] }
      syncPref(WRITE_PERMS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // ── Tab/session management ────────────────────────────────────────────────────
  const activateTab = useCallback((id: string) => {
    for (const [sid, s] of sessionsRef.current) {
      s.container.style.visibility = sid === id ? 'visible' : 'hidden'
    }
    setActiveId(id)
    const s = sessionsRef.current.get(id)
    // Only steal focus if user is not renaming a tab
    if (s) requestAnimationFrame(() => { s.fit.fit(); if (!editingIdRef.current) s.term.focus() })
  }, [])

  const connectSession = useCallback(async (sess: SessionData) => {
    sess.ws?.close()
    sess.ws = null
    sess.term.writeln('\x1b[90mConectando…\x1b[0m')
    try {
      const { data } = await api.post<{ ticket: string }>('/ai/terminal/ticket', { session_id: sess.id })
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ai/terminal/ws?ticket=${data.ticket}`)
      ws.binaryType = 'arraybuffer'
      sess.ws = ws
      ws.onopen = () => {
        // Send current terminal size so PTY matches display from the start
        const { cols, rows } = sess.term
        if (ws.readyState === WebSocket.OPEN && cols > 0) ws.send(`resize:${cols}:${rows}`)
      }
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

  const createSession = useCallback((name?: string) => {
    if (!stackRef.current) return
    counterRef.current++
    const id    = generateId()
    const label = name ?? `Sesión ${counterRef.current}`

    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;inset:0;visibility:hidden'
    stackRef.current.appendChild(container)

    const term = new Terminal(TERM_OPTIONS)
    const fit  = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    requestAnimationFrame(() => fit.fit())

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true
      if (e.code === 'KeyC') { const sel = term.getSelection(); if (sel) copyToClipboard(sel); return false }
      if (e.code === 'KeyV') { navigator.clipboard.readText().then(t => { if (t) term.paste(t) }).catch(() => {}); return false }
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
    setTabs(prev => {
      const next = [...prev, { kind: 'term' as const, id, label }]
      saveTabs(next)
      return next
    })
    activateTab(id)
    connectSession(sess).then(() => term.focus())
  }, [activateTab, connectSession])

  const openHtmlViewer = useCallback((file: WorkspaceFile) => {
    // Use path-based URL so relative links inside the HTML resolve correctly
    const src = `/api/ai/workspace/view/${file.path}`
    setTabs(prev => {
      const existing = prev.find(t => t.kind === 'html' && (t as Extract<Tab, {kind:'html'}>).src === src)
      if (existing) {
        // Just activate it
        for (const [, s] of sessionsRef.current) s.container.style.visibility = 'hidden'
        setActiveId(existing.id)
        return prev
      }
      const id = generateId()
      for (const [, s] of sessionsRef.current) s.container.style.visibility = 'hidden'
      setActiveId(id)
      return [...prev, { kind: 'html' as const, id, label: file.name, src }]
    })
  }, [])

  const closeTab = useCallback((id: string) => {
    const sess = sessionsRef.current.get(id)
    if (sess) {
      sess.ws?.close()
      sess.term.dispose()
      sess.container.remove()
      sessionsRef.current.delete(id)
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length > 0) activateTab(next[next.length - 1].id)
      else setActiveId('')
      saveTabs(next)
      return next
    })
  }, [activateTab])

  const renameTab = useCallback((id: string, label: string) => {
    const sess = sessionsRef.current.get(id)
    if (sess) sess.label = label
    setTabs(prev => {
      const next = prev.map(t => t.id === id ? { ...t, label } : t)
      saveTabs(next)
      return next
    })
  }, [])

  // ── Effects ───────────────────────────────────────────────────────────────────
  // Keep ref in sync with state so RAF callbacks can read it without stale closure
  useEffect(() => { editingIdRef.current = editingId }, [editingId])

  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === 'visible' && activeId && !editingIdRef.current) {
        sessionsRef.current.get(activeId)?.term.focus()
      }
    }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [activeId])

  useEffect(() => {
    if (!stackRef.current) return
    const ro = new ResizeObserver(() => {
      if (activeId) sessionsRef.current.get(activeId)?.fit.fit()
    })
    ro.observe(stackRef.current)
    return () => ro.disconnect()
  }, [activeId])

  useEffect(() => {
    const saved = loadSavedNames()
    if (saved.length > 0) {
      saved.forEach(n => createSession(n))
    } else {
      createSession()
    }
    refreshFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    for (const s of sessionsRef.current.values()) { s.ws?.close(); s.term.dispose() }
    sessionsRef.current.clear()
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-44 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden" style={panelZoom ? { zoom: panelZoom } : undefined}>

        {/* Header */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Consultor IA
          </p>
          <button
            onClick={() => createSession()}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva sesión
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-y-auto min-h-0 py-0.5">
          {tabs.map(tab => {
            const active = tab.id === activeId
            return (
              <div
                key={tab.id}
                onClick={() => activateTab(tab.id)}
                className={`group flex items-center gap-1 px-2 py-1.5 mx-1 my-0.5 rounded-md cursor-pointer text-xs transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {active
                  ? <ChevronRight className="w-3 h-3 shrink-0" />
                  : tab.kind === 'html'
                    ? <Globe className="w-3 h-3 shrink-0 opacity-40" />
                    : <MessageSquare className="w-3 h-3 shrink-0 opacity-40" />
                }
                {editingId === tab.id ? (
                  <input
                    autoFocus
                    value={tab.label}
                    onFocus={e => e.target.select()}
                    onChange={e => renameTab(tab.id, e.target.value)}
                    onBlur={() => { editingIdRef.current = ''; setEditingId('') }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { editingIdRef.current = ''; setEditingId('') } }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 text-xs bg-transparent border-b border-current outline-none"
                  />
                ) : (
                  <span className="flex-1 truncate" title={tab.label}>{tab.label}</span>
                )}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-auto shrink-0">
                  {editingId !== tab.id && (
                    <button
                      onClick={e => { e.stopPropagation(); editingIdRef.current = tab.id; setEditingId(tab.id) }}
                      className="hover:text-blue-400 transition-colors"
                      title="Renombrar"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                      className="hover:text-red-500 transition-colors"
                      title="Cerrar"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
            <div className="flex items-center gap-1">
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
                className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors disabled:opacity-40"
                title="Subir documento de contexto"
              >
                <Upload className={`w-3 h-3 ${uploading ? 'animate-pulse' : ''}`} />
              </button>
              <button
                onClick={refreshFiles}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Actualizar"
              >
                <RefreshCw className={`w-3 h-3 ${filesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,.doc,.xlsx,.xls,.csv,.json,.html,.htm,.py,.js,.ts"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadContextFile(f); e.target.value = '' }}
          />

          <div className="overflow-y-auto pb-1 min-h-0">
            {files.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 px-3 py-1 italic">
                Sin archivos
              </p>
            ) : (
              files.map(f => {
                const isHtml = /\.html?$/i.test(f.name)
                return (
                  <div
                    key={f.path}
                    title={`${f.path}  ·  ${fmtSize(f.size)}`}
                    className="flex items-center gap-1 px-2 py-1 mx-0.5 rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    style={{ maxWidth: 'calc(100% - 4px)' }}
                  >
                    <FileIcon name={f.name} />
                    <span className="flex-1 truncate min-w-0">{f.name}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {isHtml && (
                        <button
                          onClick={() => openHtmlViewer(f)}
                          title={`Ver ${f.name}`}
                          className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-500 dark:text-blue-400 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => downloadFile(f.path)}
                        title={`Descargar ${f.name}`}
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Write permissions */}
        <div className="border-t border-gray-200 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setShowPerms(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <span>Permisos IA</span>
            <Settings className={`w-3 h-3 transition-transform ${showPerms ? 'rotate-45' : ''}`} />
          </button>
          {showPerms && (
            <div className="px-3 pb-3 space-y-2">
              {(['create', 'edit', 'delete'] as const).map(key => {
                const labels = { create: 'Crear', edit: 'Editar', delete: 'Borrar' }
                const on = writePerms[key]
                return (
                  <label key={key} className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{labels[key]}</span>
                    <button
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggleWritePerm(key)}
                      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${on ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                    </button>
                  </label>
                )
              })}
              <p className="text-[10px] text-gray-400 dark:text-gray-600 leading-tight pt-0.5">
                Aplica en nuevas sesiones. El log registra acciones de IA por separado.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Stack area (terminals + HTML viewers) ── */}
      <div
        ref={stackRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: '#0f172a' }}
      >
        {/* HTML viewer iframes — one per html tab, visibility-toggled */}
        {tabs.map(tab =>
          tab.kind === 'html' ? (
            <iframe
              key={tab.id}
              src={(tab as Extract<Tab, { kind: 'html' }>).src}
              className="absolute inset-0 w-full h-full border-0"
              style={{ visibility: tab.id === activeId ? 'visible' : 'hidden', background: 'white' }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          ) : null
        )}
      </div>
    </div>
  )
}
