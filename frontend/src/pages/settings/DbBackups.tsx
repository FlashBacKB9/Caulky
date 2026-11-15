// Copias diarias de la base (Ajustes → Copia de seguridad, solo el administrador).
// Las hace el contenedor db-backup; «Volver a esta copia» pide escribir su fecha, el
// servidor se reinicia y esta pantalla espera hasta que acaba y recarga la página.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Database, Download, History, Loader2, X } from 'lucide-react'
import axios from 'axios'
import {
  dbBackupFileUrl, getDbBackups, getRestoreStatus, restoreDbBackup,
  type DbCopy, type RestoreStatus,
} from '../../api/dbBackups'
import { t } from '../../utils/i18n'

const WAIT_KEY = 'caulky-db-restore'   // la espera sobrevive a recargar la página

function fmtWhen(iso: string) {
  const [d, h] = iso.split('T')
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${h?.slice(0, 5) ?? ''}`
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function copyWhen(name?: string) {
  const m = name?.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : name ?? ''
}

// ── Espera mientras se restaura ───────────────────────────────────────────────

function RestoreWait({ name, onGiveUp }: { name: string; onGiveUp: () => void }) {
  const [seconds, setSeconds] = useState(0)
  const [result, setResult] = useState<RestoreStatus | null>(null)

  useEffect(() => {
    const started = Date.now()
    let stop = false
    const tick = async () => {
      if (stop) return
      setSeconds(Math.round((Date.now() - started) / 1000))
      try {
        const st = await getRestoreStatus()
        // Mientras el servidor se reinicia la petición falla: se sigue esperando
        if (st && !st.pending && (st.estado === 'ok' || st.estado === 'error')) {
          setResult(st)
          try { localStorage.removeItem(WAIT_KEY) } catch { /* sin almacenamiento */ }
          if (st.estado === 'ok') setTimeout(() => window.location.reload(), 1500)
          return
        }
      } catch { /* servidor reiniciándose */ }
      setTimeout(tick, 3000)
    }
    const first = setTimeout(tick, 2000)
    return () => { stop = true; clearTimeout(first) }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm p-6 text-center space-y-3">
        {!result && <>
          <Loader2 className="w-8 h-8 mx-auto text-blue-500 animate-spin" />
          <p className="text-sm font-semibold text-gray-800 dark:text-white">Volviendo a la copia del {copyWhen(name)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Primero se guarda una copia de cómo está ahora, luego se carga la elegida y el servidor arranca
            con ella. Tarda un poco; la página se recargará sola.
          </p>
          <p className="text-[11px] text-gray-400 tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
          {seconds > 15 * 60 && (
            <button onClick={onGiveUp} className="text-xs text-gray-400 hover:text-gray-600 underline">Dejar de esperar</button>
          )}
        </>}
        {result?.estado === 'ok' && <>
          <CheckCircle2 className="w-8 h-8 mx-auto text-green-500" />
          <p className="text-sm font-semibold text-gray-800 dark:text-white">Hecho. Recargando…</p>
        </>}
        {result?.estado === 'error' && <>
          <AlertTriangle className="w-8 h-8 mx-auto text-red-500" />
          <p className="text-sm font-semibold text-gray-800 dark:text-white">No se pudo volver a la copia</p>
          <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>
          <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">Cerrar</button>
        </>}
      </div>
    </div>
  )
}

// ── Confirmar ─────────────────────────────────────────────────────────────────

function RestoreModal({ copy, onClose, onStarted }: { copy: DbCopy; onClose: () => void; onStarted: () => void }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = input.trim() === copy.confirm

  const go = async () => {
    if (!ok) return
    setBusy(true); setError(null)
    try {
      await restoreDbBackup(copy.name, input.trim())
      onStarted()
    } catch (e) {
      const d = axios.isAxiosError(e) ? e.response?.data?.detail : null
      setError(typeof d === 'string' ? d : 'No se pudo pedir la restauración')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-amber-600" strokeWidth={1.5} />
            </div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Volver a la copia del {fmtWhen(copy.taken_at)}</h2>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
            <p className="font-semibold">Toda la base vuelve a como estaba ese día, para todos los usuarios.</p>
            <p>Lo que se haya hecho después desaparece de la aplicación. Antes de cambiar nada se guarda una copia de
              cómo está ahora («antes de restaurar»), así que se puede volver a ella.</p>
            <p>El servidor se reinicia y la aplicación no responde durante un rato. Los ficheros adjuntos no cambian.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Para confirmar, escribe la fecha de la copia: <span className="font-mono font-bold text-gray-700 dark:text-gray-200">{copy.confirm}</span>
            </label>
            <input type="text" value={input} onChange={e => setInput(e.target.value)} onPaste={e => e.preventDefault()}
              onKeyDown={e => { if (e.key === 'Enter') go() }}
              placeholder="dd/mm/aaaa" autoFocus inputMode="numeric"
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-gray-300 dark:placeholder:text-gray-600" />
          </div>
          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40">
            {t('common.cancel')}
          </button>
          <button onClick={go} disabled={!ok || busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 transition-colors">
            {busy ? 'Pidiendo…' : 'Volver a esta copia'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sección ───────────────────────────────────────────────────────────────────

function readWaiting(): string | null {
  try { return localStorage.getItem(WAIT_KEY) } catch { return null }
}

export default function DbBackups() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['db-backups'], queryFn: getDbBackups })
  const [picked, setPicked] = useState<DbCopy | null>(null)
  const [waiting, setWaiting] = useState<string | null>(readWaiting)
  const [gaveUp, setGaveUp] = useState(false)
  // Si al abrir la pantalla hay una restauración en marcha (por ejemplo tras recargar), se espera
  const waitingFor = gaveUp ? null : waiting ?? (data?.restore?.pending ? (data.restore.fichero || 'la copia') : null)

  const startWait = (name: string) => {
    try { localStorage.setItem(WAIT_KEY, name) } catch { /* sin almacenamiento */ }
    setPicked(null)
    setGaveUp(false)
    setWaiting(name)
  }
  const giveUp = () => {
    try { localStorage.removeItem(WAIT_KEY) } catch { /* sin almacenamiento */ }
    setWaiting(null)
    setGaveUp(true)
  }

  const box = 'bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800'

  if (isLoading) return <div className={`${box} px-4 py-3 text-xs text-gray-400`}>{t('common.loading')}</div>
  if (isError || !data) return <div className={`${box} px-4 py-3 text-xs text-red-500`}>No se pudo leer la lista de copias</div>

  if (!data.available) {
    return (
      <div className={`${box} px-4 py-3 flex items-start gap-3`}>
        <Database className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Las copias diarias de la base solo están en la instalación con Docker (servicio <span className="font-mono">db-backup</span>).
          Aquí no hay volumen de copias; usa «Exportar» de arriba.
        </p>
      </div>
    )
  }

  const st = data.restore
  return (
    <div className="space-y-2">
      {st?.estado === 'ok' && !st.pending && (
        <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
          <p>Última restauración: se volvió a la copia del {copyWhen(st.fichero)}{st.fin ? ` (el ${fmtWhen(st.fin)})` : ''}.
            Lo de justo antes quedó guardado en la copia «antes de restaurar» del {copyWhen(st.seguro)}.</p>
        </div>
      )}
      {st?.estado === 'error' && !st.pending && (
        <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <p>La última restauración (copia del {copyWhen(st.fichero)}) no se hizo: {st.error}</p>
        </div>
      )}
      {data.stale && (
        <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <p>{data.last_daily
            ? `La última copia diaria es del ${fmtWhen(data.last_daily)}: hace más de 2 días. Revisa el contenedor db-backup.`
            : 'Todavía no hay ninguna copia diaria. Si el contenedor db-backup acaba de arrancar, aparecerá en unos segundos.'}</p>
        </div>
      )}

      <div className={`${box} divide-y divide-gray-50 dark:divide-gray-800`}>
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">Copias diarias de la base de datos</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Una al día; se guardan las {data.keep_daily} últimas y las {data.keep_safety} últimas «antes de restaurar».
            Dónde: {data.location}. Volver a una no toca los ficheros adjuntos.
          </p>
        </div>
        {data.items.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Aún no hay copias.</p>}
        {data.items.map(c => (
          <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700 dark:text-gray-200 tabular-nums">
                {fmtWhen(c.taken_at)}
                {c.kind !== 'diaria' && (
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 align-middle">antes de restaurar</span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                {fmtSize(c.size)} · servidor · <span className="font-mono">{c.name}</span>
              </p>
            </div>
            <a href={dbBackupFileUrl(c.name)} download={c.name} title="Descargar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Download className="w-3.5 h-3.5" />
            </a>
            <button onClick={() => setPicked(c)}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Volver a esta copia
            </button>
          </div>
        ))}
      </div>

      {picked && <RestoreModal copy={picked} onClose={() => setPicked(null)} onStarted={() => startWait(picked.name)} />}
      {waitingFor && <RestoreWait name={waitingFor} onGiveUp={giveUp} />}
    </div>
  )
}
