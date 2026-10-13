import type { AccountsSummary } from '../api/accounts'
import type { Movement } from '../api/movements'
import { CURRENCIES } from '../hooks/useCurrency'
import { calcSpending, getAmountForDate, getCurrentPeriod, readBudgets } from '../pages/Budgets'
import { expandSplits } from '../utils/splits'
import { applyOverlay, readCache } from './cache'
import { CaulkyNative } from './native'
import { isNative } from './platform'

/**
 * Datos de los widgets del escritorio. Salen de la copia local (lo último descargado más los
 * cambios pendientes), ya formateados y ocultos si está el modo privacidad. Android solo
 * los pinta (Widgets.java).
 */

// ── Colores ─────────────────────────────────────────────────────────────────────

export interface WidgetStyle {
  bg: string
  /** Opacidad del fondo, 0–255 */
  bgAlpha: number
  text: string
  muted: string
  accent: string
  accentText: string
  track: string
  over: string
}

export const WIDGET_PRESETS: { id: string; name: string; style: WidgetStyle }[] = [
  {
    id: 'nothing', name: 'Nothing',
    style: { bg: '#1C1C1E', bgAlpha: 255, text: '#FFFFFF', muted: '#8E8E93', accent: '#FFFFFF', accentText: '#1C1C1E', track: '#3A3A3C', over: '#D71921' },
  },
  {
    id: 'nothing-light', name: 'Nothing claro',
    style: { bg: '#F2F2F2', bgAlpha: 255, text: '#000000', muted: '#6E6E73', accent: '#000000', accentText: '#FFFFFF', track: '#D1D1D6', over: '#D71921' },
  },
  {
    id: 'caulky', name: 'Caulky',
    style: { bg: '#0F172A', bgAlpha: 255, text: '#FFFFFF', muted: '#94A3B8', accent: '#3B82F6', accentText: '#FFFFFF', track: '#1E293B', over: '#EF4444' },
  },
  {
    id: 'glass', name: 'Cristal',
    style: { bg: '#000000', bgAlpha: 90, text: '#FFFFFF', muted: '#D1D1D6', accent: '#FFFFFF', accentText: '#000000', track: '#66FFFFFF', over: '#FF453A' },
  },
]

const STYLE_KEY = 'caulky-widget-style'

export function readWidgetStyle(): WidgetStyle {
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null')
    if (saved) return { ...WIDGET_PRESETS[0].style, ...saved }
  } catch { /* se usa el de por defecto */ }
  return WIDGET_PRESETS[0].style
}

let pushTimer: ReturnType<typeof setTimeout> | undefined

export function saveWidgetStyle(style: WidgetStyle) {
  localStorage.setItem(STYLE_KEY, JSON.stringify(style))
  // El selector de color cambia muchas veces seguidas mientras se arrastra
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void pushWidgets() }, 300)
}

// ── Formato ─────────────────────────────────────────────────────────────────────

const privacy = () => localStorage.getItem('caulky-privacy-mode') === 'true'
const currency = () => localStorage.getItem('spendly-currency') ?? 'EUR'

function money(v: number, decimals = 2): string {
  if (privacy()) return '••••'
  return v.toLocaleString('es-ES', { style: 'currency', currency: currency(), maximumFractionDigits: decimals })
    .replace(/\s/g, '') // espacios (normales y de no separación) entre cifra y moneda
}

/** Corto para el widget 1x1: 22,2k€ */
function compact(v: number): string {
  if (privacy()) return '•••'
  const sym = CURRENCIES.find(c => c.code === currency())?.symbol ?? '€'
  return Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k${sym}`
    : `${Math.round(v).toLocaleString('es-ES')}${sym}`
}

const time = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

// ── Bloques ─────────────────────────────────────────────────────────────────────

interface Item { name: string; value: string; color?: string; pct?: number; over?: boolean }
interface Block {
  title: string; smallTitle?: string; big: string; sub: string; bigOver?: boolean
  smallBig: string; smallSub: string; smallOver?: boolean
  items: Item[]
}

async function accountsBlock(): Promise<Block | null> {
  const cached = await readCache('/accounts/summary')
  if (!cached) return null
  const summary = await applyOverlay('/accounts/summary', undefined, cached.data) as AccountsSummary
  return {
    title: 'Cuentas',
    big: money(summary.total),
    sub: `Actualizado ${time()}`,
    smallBig: compact(summary.total),
    smallSub: 'Total',
    items: summary.accounts.map(a => ({ name: a.name, value: money(a.balance), color: a.color })),
  }
}

async function budgetsBlock(): Promise<Block | null> {
  const budgets = readBudgets()
  const cached = await readCache('/movements')
  if (!cached) return null
  const movements = expandSplits(await applyOverlay('/movements', undefined, cached.data) as Movement[])

  const rows = budgets.flatMap(b => {
    const { start, end } = getCurrentPeriod(b.period, b.customFrom, b.customTo, b.monthlyStartDay, b.weeklyStartDay, b.annualStartDate)
    const limit = getAmountForDate(b.versions, end)
    if (!limit) return []
    const spent = calcSpending(movements, new Set(b.typeIds), start, end)
    return [{ name: b.name, spent, limit, pct: (spent / limit) * 100 }]
  })
  if (!rows.length) {
    return { title: 'Presupuestos', big: '—', sub: 'Sin presupuestos', smallBig: '—', smallSub: 'Sin presupuestos', items: [] }
  }
  const top = rows.reduce((a, b) => (b.pct > a.pct ? b : a))
  const over = rows.filter(r => r.pct > 100).length
  return {
    title: 'Presupuestos',
    smallTitle: 'Presup.',
    big: `${Math.round(top.pct)}% ${top.name}`,
    bigOver: top.pct > 100,
    sub: over ? `${over} pasado${over === 1 ? '' : 's'} del límite` : 'Todo dentro del límite',
    smallBig: `${Math.round(top.pct)}%`,
    smallOver: top.pct > 100,
    smallSub: top.name,
    items: rows.map(r => ({
      name: r.name,
      value: privacy() ? `${Math.round(r.pct)}%` : `${money(r.spent, 0)} / ${money(r.limit, 0)}`,
      pct: Math.round(Math.min(100, r.pct)),
      over: r.pct > 100,
    })),
  }
}

async function monthBlock(): Promise<Block | null> {
  const now = new Date()
  const cached = await readCache('/stats/dashboard', { year: now.getFullYear(), month: now.getMonth() + 1 })
  const monthly = (cached?.data as { monthly?: { income: number; expenses: number; savings: number } } | undefined)?.monthly
  if (!monthly) return null
  const name = now.toLocaleDateString('es-ES', { month: 'long' })
  const spent = Math.abs(monthly.expenses)
  return {
    title: name.charAt(0).toUpperCase() + name.slice(1),
    big: money(spent),
    sub: 'Gastado este mes',
    smallBig: compact(spent),
    smallSub: 'Gastado',
    items: [
      { name: 'Ingresos', value: money(monthly.income), color: '#22C55E' },
      { name: 'Gastos', value: money(spent), color: '#EF4444' },
      { name: 'Ahorro', value: money(monthly.savings), color: '#3B82F6' },
    ],
  }
}

let pending: Promise<void> | null = null

/** Manda a Android los datos y colores actuales de los widgets. */
export function pushWidgets(): Promise<void> {
  if (!isNative) return Promise.resolve()
  if (pending) return pending
  pending = (async () => {
    const [accounts, budgets, month] = await Promise.all([
      accountsBlock().catch(() => null), budgetsBlock().catch(() => null), monthBlock().catch(() => null),
    ])
    const data: Record<string, unknown> = { style: readWidgetStyle() }
    if (accounts) data.accounts = accounts
    if (budgets) data.budgets = budgets
    if (month) data.month = month
    await CaulkyNative.updateWidgets({ data: JSON.stringify(data) }).catch(() => {})
  })().finally(() => { pending = null })
  return pending
}
