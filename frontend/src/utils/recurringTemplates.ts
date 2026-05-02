// ── Types ──────────────────────────────────────────────────────────────────────

export type RecurrenceKind = 'daily' | 'weekly' | 'monthly_day' | 'monthly_weekday'

export interface RecurrenceRule {
  kind: RecurrenceKind
  everyN: number        // daily: every N days, monthly_day: every N months
  weekdays: number[]    // weekly: 0=Mon … 6=Sun
  monthDay: number      // monthly_day: 1–31
  monthWeek: number     // monthly_weekday: 1–4 or -1 (last)
  weekday: number       // monthly_weekday: 0=Mon … 6=Sun
}

export interface TemplateRecurrence {
  rule: RecurrenceRule
  startDate: string     // ISO date
  autoCreate: boolean
  lastCreated?: string  // ISO date of last auto-run
}

export interface MovementTemplate {
  id: string
  label: string
  name: string          // supports {mes}, {año}, {mesfecha}, {mesfechabanco}
  money: string
  dateMode: 'today' | 'manual'
  bankDateMode: 'today' | 'manual'
  movement_type_id: string
  paid: boolean
  no_count: boolean
  notes: string
  recurrence?: TemplateRecurrence
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const MONTHS_NAME = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export const WEEKDAY_NAMES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

export const WEEK_ORD_NAMES = ['primer','segundo','tercer','cuarto','último']
export const WEEK_ORD_VALUES = [1, 2, 3, 4, -1]

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadTemplates(): MovementTemplate[] {
  try { const s = localStorage.getItem('movement-templates'); if (s) return JSON.parse(s) } catch { /**/ }
  return []
}
export function saveTemplates(ts: MovementTemplate[]) {
  localStorage.setItem('movement-templates', JSON.stringify(ts))
}

// ── Formula ───────────────────────────────────────────────────────────────────

export function applyFormula(str: string, movDate?: Date, bankDate?: Date): string {
  const now = new Date()
  const d = movDate ?? now
  const bd = bankDate ?? now
  return str
    .replace(/\{mes\}/gi,          MONTHS_NAME[now.getMonth()])
    .replace(/\{año\}/gi,          String(now.getFullYear()))
    .replace(/\{mesfecha\}/gi,     MONTHS_NAME[d.getMonth()])
    .replace(/\{mesfechabanco\}/gi, MONTHS_NAME[bd.getMonth()])
}

// ── Date computation ──────────────────────────────────────────────────────────

// Convert JS weekday (0=Sun) to Mon-based (0=Mon)
const jsToMon = (d: number) => (d + 6) % 7
// Convert Mon-based (0=Mon) to JS weekday (0=Sun)
const monToJs = (d: number) => (d + 1) % 7

function nthWeekdayInMonth(year: number, month: number, week: number, weekday: number): Date {
  const jsWd = monToJs(weekday)
  if (week === -1) {
    const last = new Date(year, month + 1, 0, 12)
    while (last.getDay() !== jsWd) last.setDate(last.getDate() - 1)
    return last
  }
  const first = new Date(year, month, 1, 12)
  while (first.getDay() !== jsWd) first.setDate(first.getDate() + 1)
  first.setDate(first.getDate() + (week - 1) * 7)
  return first
}

export function computeDates(rule: RecurrenceRule, startDate: Date, count: number): Date[] {
  const dates: Date[] = []
  const start = new Date(startDate)
  start.setHours(12, 0, 0, 0)

  if (rule.kind === 'daily') {
    const n = Math.max(1, rule.everyN || 1)
    const cur = new Date(start)
    while (dates.length < count) {
      dates.push(new Date(cur))
      cur.setDate(cur.getDate() + n)
    }

  } else if (rule.kind === 'weekly') {
    const wds = rule.weekdays.length > 0 ? [...rule.weekdays].sort() : [0]
    const cur = new Date(start)
    let safety = 0
    while (dates.length < count && safety < 5000) {
      if (wds.includes(jsToMon(cur.getDay()))) dates.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
      safety++
    }

  } else if (rule.kind === 'monthly_day') {
    const day = Math.min(28, Math.max(1, rule.monthDay || 1))
    const n   = Math.max(1, rule.everyN || 1)
    let y = start.getFullYear(), m = start.getMonth()
    let cur = new Date(y, m, day, 12)
    if (cur < start) { m += n; if (m > 11) { y += Math.floor(m/12); m %= 12 }; cur = new Date(y, m, day, 12) }
    while (dates.length < count) {
      dates.push(new Date(cur))
      m += n; if (m > 11) { y += Math.floor(m/12); m %= 12 }
      cur = new Date(y, m, day, 12)
    }

  } else if (rule.kind === 'monthly_weekday') {
    let y = start.getFullYear(), m = start.getMonth()
    while (dates.length < count) {
      const target = nthWeekdayInMonth(y, m, rule.monthWeek ?? 1, rule.weekday ?? 0)
      if (target >= start) dates.push(target)
      m++; if (m > 11) { m = 0; y++ }
    }
  }

  return dates
}

// ── Auto-run ──────────────────────────────────────────────────────────────────

type CreateFn = (data: {
  name: string; money: number; date: string; bank_date?: string
  movement_type_id?: number; paid: boolean; no_count: boolean; notes?: string
}) => Promise<unknown>

export async function runAutoRecurring(createFn: CreateFn): Promise<number> {
  const templates = loadTemplates()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let totalCreated = 0
  const updated = templates.map(t => ({ ...t }))

  for (let i = 0; i < updated.length; i++) {
    const tpl = updated[i]
    if (!tpl.recurrence?.autoCreate || !tpl.recurrence.rule) continue

    const { rule, startDate, lastCreated } = tpl.recurrence
    const fromStr = lastCreated ?? startDate
    const from = new Date(fromStr); from.setHours(0, 0, 0, 0)

    // Generate up to 500 occurrences from startDate and filter those due
    const allDates = computeDates(rule, new Date(startDate), 500)
    const due = allDates.filter(d => { const dd = new Date(d); dd.setHours(0,0,0,0); return dd > from && dd <= today })
    if (due.length === 0) continue

    for (const date of due) {
      const dateStr = date.toISOString().split('T')[0]
      const bankDateStr = tpl.bankDateMode === 'today' ? dateStr : undefined
      const bankD = bankDateStr ? new Date(bankDateStr) : undefined
      try {
        await createFn({
          name: applyFormula(tpl.name || tpl.label, date, bankD) || tpl.label,
          money: parseFloat(tpl.money) || 0,
          date: dateStr,
          bank_date: bankDateStr,
          movement_type_id: tpl.movement_type_id ? parseInt(tpl.movement_type_id) : undefined,
          paid: tpl.paid,
          no_count: tpl.no_count,
          notes: tpl.notes || undefined,
        })
        totalCreated++
      } catch { /* skip */ }
    }

    // Mark last created date
    updated[i] = {
      ...tpl,
      recurrence: { ...tpl.recurrence, lastCreated: due[due.length - 1].toISOString().split('T')[0] },
    }
  }

  if (totalCreated > 0) saveTemplates(updated)
  return totalCreated
}

// ── Human-readable description ────────────────────────────────────────────────

export function describeRule(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case 'daily':
      return rule.everyN === 1 ? 'Cada día' : `Cada ${rule.everyN} días`
    case 'weekly': {
      const names = rule.weekdays.map(d => WEEKDAY_NAMES[d]).join(', ')
      return `Cada semana: ${names || 'sin día'}`
    }
    case 'monthly_day':
      return `El día ${rule.monthDay} de cada ${rule.everyN === 1 ? 'mes' : `${rule.everyN} meses`}`
    case 'monthly_weekday': {
      const ord = WEEK_ORD_NAMES[WEEK_ORD_VALUES.indexOf(rule.monthWeek)] ?? 'primer'
      const wd  = WEEKDAY_NAMES[rule.weekday] ?? 'Lunes'
      return `El ${ord} ${wd} de cada mes`
    }
  }
}
