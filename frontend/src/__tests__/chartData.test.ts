import { describe, test, expect } from 'vitest'
import {
  computeChartData, applyCumulative, buildMonthSeries, mvMonthKey,
  type ChartDef, type ComputedSeries,
} from '../utils/chartData'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mv(id: number, overrides: {
  dinero?: number; date?: string
  movement_type_id?: number; account_id?: number
} = {}) {
  return {
    id, name: 'mv', money: overrides.dinero ?? 100, dinero: overrides.dinero ?? 100,
    date: overrides.date ?? '2024-01-15',
    movement_type_id: overrides.movement_type_id ?? 1,
    account_id: overrides.account_id ?? undefined,
    paid: true, no_count: false, is_shared: false, label: '', color: '', files: [],
  }
}

function def(overrides: Partial<ChartDef> = {}): ChartDef {
  return {
    sign: 'expense', xAxis: 'month', splitBy: 'none',
    metric: 'sum', defaultDisplay: 'bar', defaultColor: '#3b82f6',
    overrides: [], year: 2024,
    ...overrides,
  }
}

const GROUPS  = { 10: { name: 'Alimentación', color: '#ef4444' }, 20: { name: 'Ocio', color: '#8b5cf6' } }
const TYPES   = { 1: { name: 'Supermercado', color: '#f97316' }, 2: { name: 'Cine', color: '#a855f7' } }
const ACCOUNTS = { 5: { name: 'Cuenta Principal', color: '#10b981' } }
const TYPE_TO_GROUP = { 1: 10, 2: 20 }

// ── computeChartData – splitBy=none ──────────────────────────────────────────

describe('computeChartData – splitBy=none', () => {
  test('xAxis=none: single total bucket, value is abs(dinero)', () => {
    const { data, series } = computeChartData(
      def({ xAxis: 'none', splitBy: 'none' }),
      [mv(1, { dinero: -200 }), mv(2, { dinero: -150 })],
      {}, {}, {}, {},
    )
    expect(data).toHaveLength(1)
    expect(data[0].value).toBe(350)
    expect(series).toHaveLength(1)
    expect(series[0].key).toBe('__total__')
  })

  test('xAxis=month: one column per month key, value abs(dinero)', () => {
    const { data } = computeChartData(
      def({ xAxis: 'month', splitBy: 'none', year: 2024 }),
      [mv(1, { dinero: -100, date: '2024-01-10' }), mv(2, { dinero: -50, date: '2024-02-15' })],
      {}, {}, {}, {},
    )
    // year=2024 → months 0..current; our test values are in Jan(0) and Feb(1)
    expect(data.find(r => r['__total__'] !== undefined && r.x === 'Jan'
      || (data.indexOf(r) === 0))![0 as unknown as '__total__'] ?? data[0]['__total__']).toBeDefined()
    expect(data[0]['__total__']).toBe(100)
    expect(data[1]['__total__']).toBe(50)
  })

  test('xAxis=year: groups by year', () => {
    const { data } = computeChartData(
      def({ xAxis: 'year', splitBy: 'none' }),
      [mv(1, { dinero: -100, date: '2023-06-01' }), mv(2, { dinero: -200, date: '2024-03-01' })],
      {}, {}, {}, {},
    )
    expect(data).toHaveLength(2)
    expect(data[0].x).toBe('2023')
    expect(data[0]['__total__']).toBe(100)
    expect(data[1].x).toBe('2024')
    expect(data[1]['__total__']).toBe(200)
  })

  test('metric=count: counts occurrences instead of summing dinero', () => {
    const { data } = computeChartData(
      def({ xAxis: 'none', metric: 'count' }),
      [mv(1, { dinero: -500 }), mv(2, { dinero: -300 })],
      {}, {}, {}, {},
    )
    expect(data[0].value).toBe(2)
  })

  test('tFn receives correct key for sign=expense', () => {
    const seen: string[] = []
    computeChartData(
      def({ xAxis: 'none', splitBy: 'none', sign: 'expense' }),
      [mv(1)], {}, {}, {}, {},
      key => { seen.push(key); return key },
    )
    expect(seen).toContain('charts.expense')
  })

  test('tFn receives correct key for sign=income', () => {
    const seen: string[] = []
    computeChartData(
      def({ xAxis: 'none', splitBy: 'none', sign: 'income' }),
      [mv(1)], {}, {}, {}, {},
      key => { seen.push(key); return key },
    )
    expect(seen).toContain('charts.income')
  })
})

// ── computeChartData – splitBy=group ─────────────────────────────────────────

describe('computeChartData – splitBy=group', () => {
  test('xAxis=none: sums per group, sorts descending', () => {
    const mvs = [
      mv(1, { dinero: -100, movement_type_id: 1 }), // group 10
      mv(2, { dinero: -200, movement_type_id: 1 }), // group 10 → total 300
      mv(3, { dinero: -50,  movement_type_id: 2 }), // group 20 → total 50
    ]
    const { data, series } = computeChartData(
      def({ xAxis: 'none', splitBy: 'group' }),
      mvs, TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    expect(data[0].name).toBe('Alimentación')
    expect(data[0].value).toBe(300)
    expect(data[1].name).toBe('Ocio')
    expect(data[1].value).toBe(50)
    expect(series.map(s => s.label)).toContain('Alimentación')
  })

  test('movements with no group mapping are excluded (null key)', () => {
    const mvs = [
      mv(1, { dinero: -100, movement_type_id: 1 }), // group 10
      mv(2, { dinero: -200, movement_type_id: 99 }), // no group → excluded
    ]
    const { data } = computeChartData(
      def({ xAxis: 'none', splitBy: 'group' }),
      mvs, TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Alimentación')
  })

  test('xAxis=month: groups appear as separate series keys per month', () => {
    const mvs = [
      mv(1, { dinero: -100, date: '2024-01-10', movement_type_id: 1 }), // group 10, Jan
      mv(2, { dinero: -50,  date: '2024-01-20', movement_type_id: 2 }), // group 20, Jan
    ]
    const { data, series } = computeChartData(
      def({ xAxis: 'month', splitBy: 'group', year: 2024 }),
      mvs, TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    const jan = data[0]
    expect(jan['10']).toBe(100)
    expect(jan['20']).toBe(50)
    expect(series).toHaveLength(2)
  })

  test('color comes from group, not override', () => {
    const { series } = computeChartData(
      def({ xAxis: 'none', splitBy: 'group' }),
      [mv(1, { dinero: -100, movement_type_id: 1 })],
      TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    expect(series[0].color).toBe('#ef4444')
  })
})

// ── Devoluciones: neteo con signo antes del abs() final ──────────────────────

describe('computeChartData – las devoluciones netean el gasto', () => {
  test('splitBy=none: gasto 250 + devolución 125 → 125 (no 375)', () => {
    // Un gasto de 250 € (dinero -250) y una devolución de 125 € (dinero +125)
    // del mismo tipo deben dar un gasto neto de 125, no la suma de absolutos.
    const { data } = computeChartData(
      def({ xAxis: 'none', splitBy: 'none', sign: 'all' }),
      [mv(1, { dinero: -250 }), mv(2, { dinero: 125 })],
      {}, {}, {}, {},
    )
    expect(data[0].value).toBe(125)
  })

  test('splitBy=group: el neteo ocurre dentro del mismo grupo', () => {
    const { data } = computeChartData(
      def({ xAxis: 'none', splitBy: 'group', sign: 'all' }),
      [mv(1, { dinero: -250, movement_type_id: 1 }), mv(2, { dinero: 125, movement_type_id: 1 })],
      TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Alimentación')
    expect(data[0].value).toBe(125)
  })

  test('xAxis=month: neteo dentro del mismo mes y grupo', () => {
    const { data } = computeChartData(
      def({ xAxis: 'month', splitBy: 'group', year: 2024, sign: 'all' }),
      [
        mv(1, { dinero: -250, date: '2024-07-05', movement_type_id: 1 }),
        mv(2, { dinero: 125,  date: '2024-07-20', movement_type_id: 1 }),
      ],
      TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    // Año pasado → 12 columnas; julio = índice 6
    expect(data[6]['10']).toBe(125)
  })
})

// ── computeChartData – splitBy=type ──────────────────────────────────────────

describe('computeChartData – splitBy=type', () => {
  test('splits by type id and uses type name/color', () => {
    const mvs = [
      mv(1, { dinero: -100, movement_type_id: 1 }),
      mv(2, { dinero: -200, movement_type_id: 2 }),
    ]
    const { data, series } = computeChartData(
      def({ xAxis: 'none', splitBy: 'type' }),
      mvs, TYPE_TO_GROUP, GROUPS, TYPES, ACCOUNTS,
    )
    expect(data.map(d => d.name)).toContain('Supermercado')
    expect(data.map(d => d.name)).toContain('Cine')
    expect(series.find(s => s.key === '1')?.color).toBe('#f97316')
  })
})

// ── computeChartData – overrides ─────────────────────────────────────────────

describe('computeChartData – series overrides', () => {
  test('override label replaces default label', () => {
    const { series } = computeChartData(
      def({
        xAxis: 'none', splitBy: 'none',
        overrides: [{ key: '__total__', label: 'Mi Total', display: 'bar', color: '#ff0000' }],
      }),
      [mv(1)], {}, {}, {}, {},
    )
    expect(series[0].label).toBe('Mi Total')
  })

  test('override color replaces default for non-group/type splitBy', () => {
    const { series } = computeChartData(
      def({
        xAxis: 'none', splitBy: 'none',
        overrides: [{ key: '__total__', label: '', display: 'bar', color: '#ff0000' }],
      }),
      [mv(1)], {}, {}, {}, {},
    )
    expect(series[0].color).toBe('#ff0000')
  })

  test('cumulative flag is propagated to series', () => {
    const { series } = computeChartData(
      def({
        xAxis: 'none', splitBy: 'none',
        overrides: [{ key: '__total__', label: '', display: 'bar', color: '#aaa', cumulative: true }],
      }),
      [mv(1)], {}, {}, {}, {},
    )
    expect(series[0].cumulative).toBe(true)
  })
})

// ── applyCumulative ───────────────────────────────────────────────────────────

describe('applyCumulative', () => {
  const makeSeries = (key: string, cumulative: boolean): ComputedSeries => ({
    key, label: key, color: '#000', display: 'bar', stacked: false, cumulative,
  })

  test('no cumulative series → data unchanged', () => {
    const data = [{ x: 'Jan', a: 10 }, { x: 'Feb', a: 20 }]
    const series = [makeSeries('a', false)]
    expect(applyCumulative(data, series)).toEqual(data)
  })

  test('single cumulative series → running total', () => {
    const data = [{ x: 'Jan', a: 10 }, { x: 'Feb', a: 20 }, { x: 'Mar', a: 5 }]
    const series = [makeSeries('a', true)]
    const result = applyCumulative(data, series)
    expect(result.map(r => r['a'])).toEqual([10, 30, 35])
  })

  test('hidden cumulative series is excluded from accumulation', () => {
    const data = [{ x: 'Jan', a: 10 }, { x: 'Feb', a: 20 }]
    const series = [{ ...makeSeries('a', true), display: 'hidden' as const }]
    const result = applyCumulative(data, series)
    expect(result.map(r => r['a'])).toEqual([10, 20]) // unchanged
  })

  test('multiple series: only cumulative ones accumulate', () => {
    const data = [{ x: 'Jan', a: 10, b: 5 }, { x: 'Feb', a: 20, b: 15 }]
    const series = [makeSeries('a', true), makeSeries('b', false)]
    const result = applyCumulative(data, series)
    expect(result.map(r => r['a'])).toEqual([10, 30])
    expect(result.map(r => r['b'])).toEqual([5, 15]) // unchanged
  })

  test('empty data → empty result', () => {
    expect(applyCumulative([], [makeSeries('a', true)])).toEqual([])
  })
})

// ── buildMonthSeries ──────────────────────────────────────────────────────────

describe('buildMonthSeries', () => {
  const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  test('year=2024 past year: returns 12 months (Jan–Dec, keys 0–11)', () => {
    const result = buildMonthSeries([], 2024, 2025, MONTHS)
    expect(result).toHaveLength(12)
    expect(result[0]).toEqual({ key: '0', label: 'Ene' })
    expect(result[11]).toEqual({ key: '11', label: 'Dic' })
  })

  test('year=null: derives months from movement dates', () => {
    const mvs = [{ date: '2023-03-01' }, { date: '2023-05-15' }, { date: '2023-03-20' }]
    const result = buildMonthSeries(mvs, null, 2024, MONTHS)
    expect(result.map(r => r.key)).toEqual(['2023-03', '2023-05'])
  })
})

// ── mvMonthKey ────────────────────────────────────────────────────────────────

describe('mvMonthKey', () => {
  const m = (date: string) => ({ date } as { date: string })

  test('year mode: returns 0-based month index as string', () => {
    expect(mvMonthKey(m('2024-01-15'), 2024)).toBe('0')
    expect(mvMonthKey(m('2024-12-01'), 2024)).toBe('11')
  })

  test('all-time mode (year=null): returns YYYY-MM string', () => {
    expect(mvMonthKey(m('2024-03-15'), null)).toBe('2024-03')
  })
})
