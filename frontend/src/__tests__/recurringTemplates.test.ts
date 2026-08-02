import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeDates, applyFormula, runAutoRecurring,
  MONTHS_NAME,
  type RecurrenceRule, type MovementTemplate,
} from '../utils/recurringTemplates'

// Returns a Date at noon to avoid DST edge cases
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

const DAILY_RULE = (everyN = 1): RecurrenceRule =>
  ({ kind: 'daily', everyN, weekdays: [], monthDay: 1, monthWeek: 1, weekday: 0 })

const WEEKLY_RULE = (weekdays: number[]): RecurrenceRule =>
  ({ kind: 'weekly', everyN: 1, weekdays, monthDay: 1, monthWeek: 1, weekday: 0 })

const MONTHLY_DAY_RULE = (monthDay: number, everyN = 1): RecurrenceRule =>
  ({ kind: 'monthly_day', everyN, weekdays: [], monthDay, monthWeek: 1, weekday: 0 })

const MONTHLY_WD_RULE = (monthWeek: number, weekday: number): RecurrenceRule =>
  ({ kind: 'monthly_weekday', everyN: 1, weekdays: [], monthDay: 1, monthWeek, weekday })

// ── applyFormula ──────────────────────────────────────────────────────────────

describe('applyFormula', () => {
  test('no tokens returns string unchanged', () => {
    expect(applyFormula('Nómina')).toBe('Nómina')
  })

  test('{mesfecha} replaced with month of movDate', () => {
    const movDate = new Date(2024, 2, 15) // March
    expect(applyFormula('Gasto {mesfecha}', movDate)).toBe('Gasto Marzo')
  })

  test('{mesfechabanco} replaced with month of bankDate', () => {
    const bankDate = new Date(2024, 5, 1) // June
    expect(applyFormula('Pago {mesfechabanco}', undefined, bankDate)).toBe('Pago Junio')
  })

  test('{mesfecha} falls back to now when movDate not given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 3, 15)) // April
    expect(applyFormula('{mesfecha}')).toBe('Abril')
    vi.useRealTimers()
  })

  test('{mes} and {año} use current date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 3, 15)) // April 2024
    expect(applyFormula('{mes} {año}')).toBe('Abril 2024')
    vi.useRealTimers()
  })

  test('case insensitive', () => {
    const movDate = new Date(2024, 0, 1) // January
    expect(applyFormula('{MESFECHA}')).toContain(MONTHS_NAME[new Date().getMonth()])
    expect(applyFormula('{mesfecha}', movDate)).toBe('Enero')
  })

  test('multiple tokens in same string', () => {
    const movDate = new Date(2024, 1, 1)  // Feb
    const bankDate = new Date(2024, 2, 1) // Mar
    const result = applyFormula('{mesfecha} → {mesfechabanco}', movDate, bankDate)
    expect(result).toBe('Febrero → Marzo')
  })
})

// ── computeDates ──────────────────────────────────────────────────────────────

describe('computeDates – daily', () => {
  test('everyN=1 generates consecutive days', () => {
    const dates = computeDates(DAILY_RULE(1), d(2024, 1, 1), 3)
    expect(dates.map(x => x.getDate())).toEqual([1, 2, 3])
  })

  test('everyN=7 generates weekly occurrences', () => {
    const dates = computeDates(DAILY_RULE(7), d(2024, 1, 1), 3)
    expect(dates.map(x => x.getDate())).toEqual([1, 8, 15])
  })

  test('count=0 returns empty array', () => {
    expect(computeDates(DAILY_RULE(1), d(2024, 1, 1), 0)).toHaveLength(0)
  })

  test('count=1 returns only start date', () => {
    const dates = computeDates(DAILY_RULE(1), d(2024, 6, 15), 1)
    expect(dates).toHaveLength(1)
    expect(dates[0].getDate()).toBe(15)
  })
})

describe('computeDates – weekly', () => {
  test('Monday only generates every Monday', () => {
    // Jan 1, 2024 = Monday
    const dates = computeDates(WEEKLY_RULE([0]), d(2024, 1, 1), 3)
    expect(dates.map(x => x.getDate())).toEqual([1, 8, 15])
    expect(dates.every(x => x.getDay() === 1)).toBe(true) // JS Monday = 1
  })

  test('Mon+Fri generates alternating weekdays', () => {
    // Jan 1=Mon, Jan 5=Fri, Jan 8=Mon, Jan 12=Fri
    const dates = computeDates(WEEKLY_RULE([0, 4]), d(2024, 1, 1), 4)
    expect(dates.map(x => x.getDate())).toEqual([1, 5, 8, 12])
  })

  test('empty weekdays falls back to Monday', () => {
    const dates = computeDates(WEEKLY_RULE([]), d(2024, 1, 1), 2)
    expect(dates.every(x => x.getDay() === 1)).toBe(true)
  })
})

describe('computeDates – monthly_day', () => {
  test('15th of each month', () => {
    const dates = computeDates(MONTHLY_DAY_RULE(15), d(2024, 1, 1), 3)
    expect(dates.map(x => `${x.getMonth() + 1}-${x.getDate()}`))
      .toEqual(['1-15', '2-15', '3-15'])
  })

  test('skips current month when day already passed', () => {
    // Start Jan 20, day=15 → first occurrence is Feb 15
    const dates = computeDates(MONTHLY_DAY_RULE(15), d(2024, 1, 20), 2)
    expect(dates.map(x => `${x.getMonth() + 1}-${x.getDate()}`))
      .toEqual(['2-15', '3-15'])
  })

  test('everyN=3 jumps quarters', () => {
    const dates = computeDates(MONTHLY_DAY_RULE(1, 3), d(2024, 1, 1), 3)
    expect(dates.map(x => x.getMonth())).toEqual([0, 3, 6]) // Jan, Apr, Jul
  })

  test('crosses year boundary correctly', () => {
    const dates = computeDates(MONTHLY_DAY_RULE(1), d(2024, 12, 1), 3)
    expect(dates.map(x => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`))
      .toEqual(['2024-12-1', '2025-1-1', '2025-2-1'])
  })
})

describe('computeDates – monthly_weekday', () => {
  test('first Monday of each month', () => {
    // Jan 2024: Jan 1 = Monday; Feb 2024: Feb 5 = first Monday
    const dates = computeDates(MONTHLY_WD_RULE(1, 0), d(2024, 1, 1), 2)
    expect(dates.map(x => `${x.getMonth() + 1}-${x.getDate()}`))
      .toEqual(['1-1', '2-5'])
  })

  test('last Friday of each month', () => {
    // Jan 2024: Jan 26; Feb 2024: Feb 23
    const dates = computeDates(MONTHLY_WD_RULE(-1, 4), d(2024, 1, 1), 2)
    expect(dates.map(x => `${x.getMonth() + 1}-${x.getDate()}`))
      .toEqual(['1-26', '2-23'])
  })

  test('result dates are on the correct weekday', () => {
    // 2nd Wednesday (weekday=2), start May 2024
    const dates = computeDates(MONTHLY_WD_RULE(2, 2), d(2024, 5, 1), 3)
    // JS Wednesday = 3
    expect(dates.every(x => x.getDay() === 3)).toBe(true)
  })
})

// ── runAutoRecurring ──────────────────────────────────────────────────────────

function makeTpl(overrides: Partial<MovementTemplate> & { recurrence: MovementTemplate['recurrence'] }): MovementTemplate {
  return {
    id: 1, label: 'Plantilla', name: 'Test', money: '100',
    dateMode: 'today', bankDateMode: 'today',
    movement_type_id: '1', account_id: '', paid: true, no_count: false, notes: '',
    ...overrides,
  }
}

describe('runAutoRecurring', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test('skips template with autoCreate=false', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({ recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: false } })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    expect(count).toBe(0)
    expect(createFn).not.toHaveBeenCalled()
  })

  test('skips template with no recurrence', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({ recurrence: undefined })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    expect(count).toBe(0)
    expect(createFn).not.toHaveBeenCalled()
  })

  test('creates one movement when lastCreated is yesterday', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({
      recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-14' },
    })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    expect(count).toBe(1)
    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ date: '2024-01-15' }))
    expect(onUpdated).toHaveBeenCalledWith(1, expect.objectContaining({ lastCreated: '2024-01-15' }))
  })

  test('creates multiple movements for missed days', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({
      recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-12' },
    })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    // Due: Jan 13, 14, 15
    expect(count).toBe(3)
    expect(onUpdated).toHaveBeenCalledWith(1, expect.objectContaining({ lastCreated: '2024-01-15' }))
  })

  test('skips when no dates are due (already up to date)', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({
      recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-15' },
    })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    expect(count).toBe(0)
    expect(createFn).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  test('applies formula to movement name', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12)) // January 2024
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl = makeTpl({
      name: 'Gasto {mesfecha}',
      recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-14' },
    })

    await runAutoRecurring([tpl], createFn, onUpdated)
    expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gasto Enero' }))
  })

  test('uses startDate as from when no lastCreated', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    // startDate = Jan 13, no lastCreated → from = Jan 13 → due = Jan 14, Jan 15
    const tpl = makeTpl({
      recurrence: { rule: DAILY_RULE(), startDate: '2024-01-13', autoCreate: true },
    })

    const count = await runAutoRecurring([tpl], createFn, onUpdated)
    expect(count).toBe(2)
  })

  test('returns sum across multiple templates', async () => {
    vi.setSystemTime(new Date(2024, 0, 15, 12))
    const createFn = vi.fn().mockResolvedValue(undefined)
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const tpl1 = makeTpl({
      id: 1, recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-14' },
    })
    const tpl2 = makeTpl({
      id: 2, recurrence: { rule: DAILY_RULE(), startDate: '2024-01-10', autoCreate: true, lastCreated: '2024-01-13' },
    })

    const count = await runAutoRecurring([tpl1, tpl2], createFn, onUpdated)
    expect(count).toBe(3) // 1 + 2
  })
})
