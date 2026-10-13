import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Cloud, CloudOff, Download, HardDrive, Loader2, RefreshCw, Server, Trash2 } from 'lucide-react'
import api from '../api/client'
import { cachedKeys, clearCache, lastFullSync, readCache } from './cache'
import { isOnline, probe, subscribe } from './connectivity'
import { clearFiles, filesEnabled, filesUsage, setFilesEnabled } from './files'
import { getOps, subscribeOutbox } from './outbox'
import { apiBase, getServerUrl, setServerUrl, SYNC_NOW_EVENT } from './platform'
import { prefetchAll } from './prefetch'
import { clearOfflineData } from './session'

/** Acerca de → Almacenamiento local (solo en la APK). */

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'nunca'

interface Usage { used: number | null; quota: number | null; responses: number; movements: number; files: number; filesBytes: number }

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-800 dark:text-gray-100 text-right">{value}</span>
    </div>
  )
}

const BTN = 'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-40'

export default function LocalStorageInfo() {
  const online = useSyncExternalStore(subscribe, isOnline)
  const pending = useSyncExternalStore(subscribeOutbox, () => getOps().length)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [checking, setChecking] = useState(false)
  const [download, setDownload] = useState<[number, number] | null>(null)
  const [withFiles, setWithFiles] = useState(filesEnabled)
  const [server, setServer] = useState(getServerUrl())
  const [msg, setMsg] = useState('')

  const measure = useCallback(async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined)
    const movements = (await readCache('/movements').catch(() => undefined))?.data
    const f = await filesUsage()
    setUsage({
      used: est?.usage ?? null, quota: est?.quota ?? null,
      responses: (await cachedKeys().catch(() => [])).length,
      movements: Array.isArray(movements) ? movements.length : 0,
      files: f.count, filesBytes: f.bytes,
    })
  }, [])

  useEffect(() => { queueMicrotask(() => { void measure() }) }, [measure])

  async function check() {
    setChecking(true)
    await probe()
    setChecking(false)
  }

  async function downloadAll() {
    setDownload([0, 1])
    await prefetchAll((d, t) => setDownload([d, t]))
    setDownload(null)
    void measure()
  }

  async function wipe() {
    if (!window.confirm('Se borra la copia local (datos y adjuntos) y se vuelve a descargar. Los cambios sin sincronizar se conservan. ¿Seguir?')) return
    await Promise.all([clearCache(), clearFiles()])
    localStorage.removeItem('caulky-offline-last-sync')
    void measure()
    if (isOnline()) void downloadAll()
  }

  async function saveServer() {
    setMsg('')
    const before = getServerUrl()
    setServerUrl(server)
    const after = getServerUrl()
    setServer(after)
    if (after === before) { void check(); return }
    if (pending) {
      setServerUrl(before)
      setServer(before)
      setMsg('Antes de cambiar de servidor sincroniza o descarta los cambios pendientes.')
      return
    }
    if (!window.confirm(`Cambiar a ${after}? Tendrás que volver a iniciar sesión y se borra la copia local del servidor anterior.`)) {
      setServerUrl(before)
      setServer(before)
      return
    }
    await clearOfflineData()
    api.defaults.baseURL = apiBase()
    window.location.href = '/login'
  }

  return (
    <div className="space-y-4">
      {/* Conexión */}
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          {online
            ? <Cloud className="w-4 h-4 text-emerald-500" />
            : <CloudOff className="w-4 h-4 text-gray-400" />}
          <span className={`text-sm font-medium ${online ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-300'}`}>
            {online ? 'Conectado al servidor' : 'Sin conexión con el servidor'}
          </span>
          <button onClick={check} disabled={checking}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Comprobar conexión" title="Comprobar">
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <label className="block">
          <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 mb-1">
            <Server className="w-3 h-3" /> Servidor
          </span>
          <div className="flex gap-2">
            <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={server}
              onChange={e => setServer(e.target.value)} placeholder="http://192.168.1.10:8081"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={saveServer} className={`${BTN} bg-gray-900 dark:bg-white text-white dark:text-gray-900`}>Guardar</button>
          </div>
        </label>
        {msg && <p className="text-[11px] text-red-600 dark:text-red-400">{msg}</p>}
      </div>

      {/* Datos guardados */}
      <div>
        <Row label="Última descarga completa" value={when(lastFullSync())} />
        <Row label="Cambios sin sincronizar" value={pending ? <span className="text-amber-600 dark:text-amber-400">{pending}</span> : 'ninguno'} />
        <Row label="Movimientos guardados" value={usage ? usage.movements.toLocaleString('es-ES') : '…'} />
        <Row label="Consultas guardadas" value={usage ? usage.responses : '…'} />
        <Row label="Adjuntos guardados" value={usage ? `${usage.files} · ${bytes(usage.filesBytes)}` : '…'} />
        <Row label="Espacio usado" value={usage?.used != null
          ? `${bytes(usage.used)}${usage.quota ? ` de ${bytes(usage.quota)}` : ''}` : '…'} />
        {usage?.used != null && usage.quota ? (
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-1 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${Math.max(1, (usage.used / usage.quota) * 100)}%` }} />
          </div>
        ) : null}
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={withFiles}
          onChange={e => { setWithFiles(e.target.checked); setFilesEnabled(e.target.checked) }}
          className="mt-0.5 w-4 h-4 accent-blue-500" />
        <span className="text-xs text-gray-600 dark:text-gray-300">
          Descargar también los adjuntos (PDF y fotos de movimientos y tickets) para verlos sin conexión
        </span>
      </label>

      {/* Acciones */}
      {download && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Descargando {download[0]}/{download[1]}…
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!online || !!download}
          onClick={() => window.dispatchEvent(new Event(SYNC_NOW_EVENT))}
          className={`${BTN} bg-gray-900 dark:bg-white text-white dark:text-gray-900`}>
          <RefreshCw className="w-3.5 h-3.5" /> {pending ? 'Sincronizar cambios' : 'Sincronizar ahora'}
        </button>
        <button disabled={!online || !!download} onClick={downloadAll}
          className={`${BTN} border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}>
          <Download className="w-3.5 h-3.5" /> Descargar todo
        </button>
        <button onClick={() => void measure()}
          className={`${BTN} border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}>
          <HardDrive className="w-3.5 h-3.5" /> Recalcular espacio
        </button>
        <button onClick={wipe} disabled={!!download}
          className={`${BTN} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}>
          <Trash2 className="w-3.5 h-3.5" /> Borrar copia local
        </button>
      </div>
    </div>
  )
}
