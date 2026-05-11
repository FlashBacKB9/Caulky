import type { Movement } from '../api/movements'
import type { Group } from '../api/groups'
import type { MovementType } from '../api/movementTypes'
import type { Account } from '../api/accounts'

// ── Types ─────────────────────────────────────────────────────────────────────

export type XAxisType   = 'month' | 'year' | 'none'
export type SplitByType = 'none' | 'group' | 'type' | 'account'
export type SignType    = 'all' | 'expense' | 'income'
export type MetricType = 'sum' | 'count'

export interface SeriesOverride {
  key: string
  display: 'bar' | 'line' | 'area' | 'hidden'
  color: string
  label: string
  stacked?: boolean
  cumulative?: boolean
}

export interface ChartDef {
  sign: SignType
  xAxis: XAxisType
  splitBy: SplitByType
  metric: MetricType
  defaultDisplay: 'bar' | 'line' | 'area' | 'donut' | 'pie'
  defaultColor: string
  overrides: SeriesOverride[]
  year: number | null
}

export interface ComputedSeries {
  key: string
  label: string
  color: string
  display: 'bar' | 'line' | 'area' | 'hidden'
  stacked: boolean
  cumulative: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildMonthSeries(
  movements: Pick<Movement, 'date'>[],
  year: number | null,
  curYear: number = new Date().getFullYear(),
  monthNames: string[] = Array.from({ length: 12 }, (_, i) => String(i)),
): { key: string; label: string }[] {
  if (year !== null) {
    const cutMonth = year < curYear ? 11 : new Date().getMonth()
    return Array.from({ length: cutMonth + 1 }, (_, i) => ({ key: String(i), label: monthNames[i] }))
  }
  const seen = [...new Set(movements.map(m => m.date.slice(0, 7)))].sort()
  return seen.map(ym => ({ key: ym, label: `${monthNames[+ym.slice(5, 7) - 1]} '${ym.slice(2, 4)}` }))
}

export function mvMonthKey(mv: Pick<Movement, 'date'>, year: number | null): string {
  return year !== null ? String(+mv.date.slice(5, 7) - 1) : mv.date.slice(0, 7)
}

// ── computeChartData ──────────────────────────────────────────────────────────

export function computeChartData(
  def: ChartDef,
  movements: Movement[],
  typeToGroup: Record<number, number>,
  groupById: Record<number, Pick<Group, 'name' | 'color'>>,
  typeById: Record<number, Pick<MovementType, 'name' | 'color'>>,
  accountById: Record<number, Pick<Account, 'name' | 'color'>>,
  tFn: (key: string) => string = k => k,
  monthNames?: string[],
  curYear?: number,
): { data: Record<string, unknown>[]; series: ComputedSeries[] } {
  const overrideMap = Object.fromEntries(def.overrides.map(o => [o.key, o]))

  function seriesKey(mv: Movement): string | null {
    if (def.splitBy === 'none')  return '__total__'
    if (def.splitBy === 'group') { const g = typeToGroup[mv.movement_type_id ?? -1]; return g ? String(g) : null }
    if (def.splitBy === 'type')  return mv.movement_type_id ? String(mv.movement_type_id) : null
    return mv.account_id ? String(mv.account_id) : null
  }

  function baseInfo(key: string): { label: string; color: string } {
    if (key === '__total__') {
      const label = def.sign === 'expense' ? tFn('charts.expense')
        : def.sign === 'income' ? tFn('charts.income')
        : 'Total'
      return { label, color: def.defaultColor }
    }
    if (def.splitBy === 'group')  return { label: groupById[+key]?.name ?? '?',   color: groupById[+key]?.color   ?? '#6b7280' }
    if (def.splitBy === 'type')   return { label: typeById[+key]?.name   ?? '?',   color: typeById[+key]?.color    ?? '#6b7280' }
    return                               { label: accountById[+key]?.name ?? '?',  color: accountById[+key]?.color ?? '#6b7280' }
  }

  function makeSeries(key: string): ComputedSeries {
    const info = baseInfo(key); const ov = overrideMap[key]
    const fallback = (def.defaultDisplay === 'donut' || def.defaultDisplay === 'pie') ? 'bar' : def.defaultDisplay
    const liveColor = (def.splitBy === 'group' || def.splitBy === 'type') ? info.color : (ov?.color ?? info.color)
    return {
      key,
      label: ov?.label ?? info.label,
      color: liveColor,
      display: ov?.display ?? fallback,
      stacked: ov?.stacked ?? false,
      cumulative: ov?.cumulative ?? false,
    }
  }

  // Charts.tsx uses signed dinero so refunds cancel; final values are abs()
  const val = (mv: Movement) => def.metric === 'count' ? 1 : mv.dinero

  const keyOrder: string[] = []; const keySeen = new Set<string>()
  for (const mv of movements) { const k = seriesKey(mv); if (k && !keySeen.has(k)) { keySeen.add(k); keyOrder.push(k) } }

  if (def.xAxis === 'none') {
    const byKey: Record<string, number> = {}
    for (const mv of movements) { const k = seriesKey(mv); if (k) byKey[k] = (byKey[k] ?? 0) + val(mv) }
    const data = keyOrder.map(key => {
      const info = baseInfo(key); const ov = overrideMap[key]
      const liveColor = (def.splitBy === 'group' || def.splitBy === 'type') ? info.color : (ov?.color ?? info.color)
      return { name: ov?.label ?? info.label, value: Math.abs(byKey[key] ?? 0), color: liveColor }
    }).sort((a, b) => (b.value as number) - (a.value as number))
    return { data, series: keyOrder.map(makeSeries) }
  }

  const isYear = def.xAxis === 'year'
  const xBuckets = isYear
    ? [...new Set(movements.map(mv => mv.date.slice(0, 4)))].sort().map(y => ({ key: y, label: y }))
    : buildMonthSeries(movements, def.year, curYear, monthNames)

  const byBucket: Record<string, Record<string, number>> = {}
  for (const { key } of xBuckets) byBucket[key] = {}
  for (const mv of movements) {
    const bucket = isYear ? mv.date.slice(0, 4) : mvMonthKey(mv, def.year)
    const k = seriesKey(mv)
    if (!k || !byBucket[bucket]) continue
    byBucket[bucket][k] = (byBucket[bucket][k] ?? 0) + val(mv)
  }
  const data = xBuckets.map(({ key, label }) => ({
    x: label, ...Object.fromEntries(keyOrder.map(k => [k, Math.abs(byBucket[key]?.[k] ?? 0)]))
  }))
  return { data, series: keyOrder.map(makeSeries) }
}

// ── applyCumulative ───────────────────────────────────────────────────────────

export function applyCumulative(
  data: Record<string, unknown>[],
  series: ComputedSeries[],
): Record<string, unknown>[] {
  const cumKeys = series.filter(s => s.cumulative && s.display !== 'hidden').map(s => s.key)
  if (cumKeys.length === 0) return data
  const running: Record<string, number> = {}
  return data.map(row => {
    const newRow = { ...row }
    for (const k of cumKeys) {
      running[k] = (running[k] ?? 0) + ((row[k] as number) ?? 0)
      newRow[k] = running[k]
    }
    return newRow
  })
}
