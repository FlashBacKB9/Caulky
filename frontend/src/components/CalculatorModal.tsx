import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Calculator, X, GripHorizontal, Trash2, Copy } from 'lucide-react'

// ── Historial ─────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'caulky-calc-history'
const POS_KEY     = 'caulky-calc-pos'
const MAX_HISTORY = 60

interface HistoryEntry { expr: string; result: string }

function loadHistory(): HistoryEntry[] {
  try {
    const a = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(a) ? (a as HistoryEntry[]) : []
  } catch { return [] }
}
function saveHistory(h: HistoryEntry[]) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)) }

function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null
  } catch { return null }
}
function savePos(p: { x: number; y: number }) { localStorage.setItem(POS_KEY, JSON.stringify(p)) }

// ── Motor de cálculo ──────────────────────────────────────────────────────────

type Op = '+' | '−' | '×' | '÷' | '%'

function applyOp(a: number, b: number, op: Op): number {
  switch (op) {
    case '+': return a + b
    case '−': return a - b
    case '×': return a * b
    case '÷': return b === 0 ? NaN : a / b
    case '%': return a * b / 100   // «200 % 21» = el 21% de 200
  }
}

// Redondea a 2 decimales cuando el resultado es «de dinero», si no deja hasta 8
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return 'Error'
  const r2 = Math.round(n * 100) / 100
  if (Math.abs(n - r2) < 1e-9) return String(r2)
  return String(Math.round(n * 1e8) / 1e8)
}

const PANEL_W = 420
const PANEL_H = 330

// ── Componente ────────────────────────────────────────────────────────────────

export default function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [entry, setEntry]     = useState('0')       // número que se está escribiendo
  const [acc, setAcc]         = useState<number | null>(null)  // acumulado
  const [op, setOp]           = useState<Op | null>(null)
  const [fresh, setFresh]     = useState(true)      // el próximo dígito reemplaza `entry`
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)

  // Posición inicial: la guardada (recortada a la ventana actual) o abajo a la derecha
  const [pos, setPos] = useState(() => {
    const saved = loadPos()
    const w = Math.min(PANEL_W, window.innerWidth - 16)
    if (!saved) return {
      x: Math.max(8, window.innerWidth  - w - 32),
      y: Math.max(8, window.innerHeight - PANEL_H - 32),
    }
    return {
      x: Math.min(Math.max(0, saved.x), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, saved.y), Math.max(0, window.innerHeight - 44)),
    }
  })
  const dragRef  = useRef<{ dx: number; dy: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Arrastre ────────────────────────────────────────────────────────────────
  // Ancho real del panel (en móvil se estrecha), para no dejarlo salir de la ventana
  const clamp = (p: { x: number; y: number }) => {
    const w = panelRef.current?.offsetWidth ?? Math.min(PANEL_W, window.innerWidth - 16)
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 44)),
    }
  }

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.preventDefault()
    panelRef.current?.focus()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }))
    }
    const onUp = () => {
      if (dragRef.current) { dragRef.current = null; savePos(pos) }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [pos])

  // Mantener el panel dentro de la ventana al redimensionar
  useEffect(() => {
    const onResize = () => setPos(clamp)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Acciones ────────────────────────────────────────────────────────────────
  const pushHistory = useCallback((expr: string, result: string) => {
    setHistory(prev => {
      const next = [{ expr, result }, ...prev].slice(0, MAX_HISTORY)
      saveHistory(next)
      return next
    })
  }, [])

  const inputDigit = useCallback((d: string) => {
    setEntry(prev => {
      if (fresh) return d === '.' ? '0.' : d
      if (d === '.') return prev.includes('.') ? prev : prev + '.'
      return prev === '0' ? d : prev + d
    })
    setFresh(false)
  }, [fresh])

  const chooseOp = useCallback((next: Op) => {
    const cur = parseFloat(entry) || 0
    if (acc !== null && op && !fresh) {
      const res = applyOp(acc, cur, op)
      pushHistory(`${fmtNum(acc)} ${op} ${fmtNum(cur)}`, fmtNum(res))
      setAcc(res)
      setEntry(fmtNum(res))
    } else if (acc === null) {
      setAcc(cur)
    }
    setOp(next)
    setFresh(true)
  }, [entry, acc, op, fresh, pushHistory])

  const equals = useCallback(() => {
    if (acc === null || !op) return
    const cur = parseFloat(entry) || 0
    const res = applyOp(acc, cur, op)
    pushHistory(`${fmtNum(acc)} ${op} ${fmtNum(cur)}`, fmtNum(res))
    setEntry(fmtNum(res))
    setAcc(null)
    setOp(null)
    setFresh(true)
  }, [acc, op, entry, pushHistory])

  const clearAll = useCallback(() => { setEntry('0'); setAcc(null); setOp(null); setFresh(true) }, [])

  const backspace = useCallback(() => {
    setEntry(prev => {
      if (fresh) return prev
      const n = prev.slice(0, -1)
      return n === '' || n === '-' ? '0' : n
    })
  }, [fresh])

  const negate = useCallback(() => {
    setEntry(prev => prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev)
    setFresh(false)
  }, [])

  // ── Teclado: solo cuando el foco está dentro del panel, para no robar las
  // pulsaciones a los formularios de la app mientras la calculadora flota ─────
  useEffect(() => { panelRef.current?.focus() }, [])

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key
    if (/^[0-9]$/.test(k))               { inputDigit(k); e.preventDefault() }
    else if (k === '.' || k === ',')     { inputDigit('.'); e.preventDefault() }
    else if (k === '+')                  { chooseOp('+'); e.preventDefault() }
    else if (k === '-')                  { chooseOp('−'); e.preventDefault() }
    else if (k === '*' || k === 'x')     { chooseOp('×'); e.preventDefault() }
    else if (k === '/')                  { chooseOp('÷'); e.preventDefault() }
    else if (k === '%')                  { chooseOp('%'); e.preventDefault() }
    else if (k === 'Enter' || k === '=') { equals(); e.preventDefault() }
    else if (k === 'Backspace')          { backspace(); e.preventDefault() }
    else if (k === 'Escape')             { onClose() }
    else if (k === 'Delete' || k.toLowerCase() === 'c') { clearAll(); e.preventDefault() }
  }

  // ── Teclado visual ──────────────────────────────────────────────────────────
  const keyCls  = 'h-9 rounded-lg text-sm font-medium transition-colors select-none'
  const numCls  = `${keyCls} bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700`
  const opCls   = `${keyCls} bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60`
  const fnCls   = `${keyCls} bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700`

  const KEYS: { label: string; cls: string; onClick: () => void; span?: boolean }[] = [
    { label: 'C',  cls: fnCls, onClick: clearAll },
    { label: '←',  cls: fnCls, onClick: backspace },
    { label: '±',  cls: fnCls, onClick: negate },
    { label: '÷',  cls: opCls, onClick: () => chooseOp('÷') },
    { label: '7',  cls: numCls, onClick: () => inputDigit('7') },
    { label: '8',  cls: numCls, onClick: () => inputDigit('8') },
    { label: '9',  cls: numCls, onClick: () => inputDigit('9') },
    { label: '×',  cls: opCls, onClick: () => chooseOp('×') },
    { label: '4',  cls: numCls, onClick: () => inputDigit('4') },
    { label: '5',  cls: numCls, onClick: () => inputDigit('5') },
    { label: '6',  cls: numCls, onClick: () => inputDigit('6') },
    { label: '−',  cls: opCls, onClick: () => chooseOp('−') },
    { label: '1',  cls: numCls, onClick: () => inputDigit('1') },
    { label: '2',  cls: numCls, onClick: () => inputDigit('2') },
    { label: '3',  cls: numCls, onClick: () => inputDigit('3') },
    { label: '+',  cls: opCls, onClick: () => chooseOp('+') },
    { label: '%',  cls: fnCls, onClick: () => chooseOp('%') },
    { label: '0',  cls: numCls, onClick: () => inputDigit('0') },
    { label: ',',  cls: numCls, onClick: () => inputDigit('.') },
    { label: '=',  cls: `${keyCls} bg-blue-500 text-white hover:bg-blue-600`, onClick: equals },
  ]

  const pending = acc !== null && op ? `${fmtNum(acc)} ${op}` : ''

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className="fixed z-[70] w-[min(420px,calc(100vw-16px))] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden outline-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Barra de arrastre */}
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 cursor-move select-none"
      >
        <GripHorizontal className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
        <Calculator className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" strokeWidth={1.5} />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Calculadora</span>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-colors"
          title="Cerrar (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex">
        {/* Teclado */}
        <div className="p-3 space-y-2 w-[228px] shrink-0">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-right">
            <p className="text-[10px] h-3.5 text-gray-400 dark:text-gray-500 tabular-nums truncate">{pending}</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums truncate">{entry}</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {KEYS.map(k => (
              <button key={k.label} type="button" onClick={k.onClick} className={k.cls}>{k.label}</button>
            ))}
          </div>
        </div>

        {/* Historial */}
        <div className="flex-1 min-w-0 border-l border-gray-100 dark:border-gray-800 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Historial</span>
            {history.length > 0 && (
              <button
                onClick={() => { setHistory([]); saveHistory([]) }}
                className="p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                title="Borrar historial"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[248px]">
            {history.length === 0 ? (
              <p className="text-[11px] text-gray-300 dark:text-gray-600 text-center px-3 py-6">
                Los cálculos aparecerán aquí
              </p>
            ) : history.map((h, i) => (
              <button
                key={i}
                onClick={() => { setEntry(h.result); setFresh(true) }}
                title="Usar este resultado"
                className="w-full text-right px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group"
              >
                <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums truncate">{h.expr}</p>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums truncate flex items-center justify-end gap-1">
                  <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  = {h.result}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
