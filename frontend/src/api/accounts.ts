import api from './client'

export type AccountCategory = 'corriente' | 'ahorro' | 'inversion' | 'etf' | 'deposito' | 'inmueble' | 'vehiculo' | 'hucha' | 'credito'

export interface Account {
  id: number
  name: string
  description: string | null
  color: string
  icon: string
  initial_balance: number
  balance: number
  sort_order: number
  is_main: boolean
  category: AccountCategory
  depreciation_rate: number | null
  value_date: string | null
  new_car: boolean
  interest_enabled: boolean
  interest_type_id: number | null
  interest_tax_rate: number | null
  credit_limit: number | null
  credit_cutoff_day: number | null
  credit_charge_day: number | null
  /** Cuenta desde la que se paga el cargo; null = la principal */
  credit_pay_account_id: number | null
  credit_auto_charge: boolean
  credit_last_cycle_end: string | null
  /** Tope + saldo: lo que aún se puede gastar. Solo en tarjetas con tope. */
  credit_available: number | null
}

/** Campos editables de una tarjeta de crédito */
export type CreditFields = Pick<Account, 'credit_limit' | 'credit_cutoff_day' | 'credit_charge_day' | 'credit_pay_account_id' | 'credit_auto_charge'>

/** Un ciclo de tarjeta aún sin cobrar: se pinta como previsión en el calendario. */
export interface CreditCycle {
  account_id: number
  cycle_start: string
  cycle_end: string
  charge_date: string
  amount: number
  pay_account_id: number | null
  /** El corte ya pasó */
  closed: boolean
  /** El día de cargo ya llegó (solo quedan así los de cargo manual) */
  due: boolean
  auto: boolean
}

export interface AccountsSummary {
  accounts: Account[]
  total: number
}

export const getAccountsSummary = () =>
  api.get<AccountsSummary>('/accounts/summary').then(r => r.data)

export const updateAccount = (id: number, initial_balance: number) =>
  api.put<Account>(`/accounts/${id}`, { initial_balance }).then(r => r.data)

export const updateAccountFull = (id: number, patch: Partial<Pick<Account, 'name' | 'color' | 'icon' | 'initial_balance' | 'category' | 'depreciation_rate' | 'value_date' | 'new_car'
    | 'interest_enabled' | 'interest_type_id' | 'interest_tax_rate'> & CreditFields>) =>
  api.put<Account>(`/accounts/${id}`, patch).then(r => r.data)

export const createAccount = (body: { name: string; color: string; icon: string; initial_balance: number; category: AccountCategory; depreciation_rate?: number | null; value_date?: string | null; new_car?: boolean } & Partial<CreditFields>) =>
  api.post<Account>('/accounts/', body).then(r => r.data)

export const getCreditCycles = () =>
  api.get<CreditCycle[]>('/accounts/credit-cycles').then(r => r.data)

export const createCreditCharge = (accountId: number, cycleEnd: string, amount?: number) =>
  api.post<{ movement_id: number | null; amount: number }>(`/accounts/${accountId}/credit-charges`, { cycle_end: cycleEnd, amount }).then(r => r.data)

export const reorderAccounts = (ids: number[]) =>
  api.post('/accounts/reorder', { ids })

export const deleteAccount = (id: number, opts: { deleteMovements?: boolean; convertToExpense?: boolean } = {}) =>
  api.delete(`/accounts/${id}`, {
    params: {
      delete_movements: opts.deleteMovements ?? false,
      convert_to_expense: opts.convertToExpense ?? false,
    },
  })

export const ACCOUNT_CATEGORIES: { value: AccountCategory; labelKey: string }[] = [
  { value: 'corriente', labelKey: 'account.category.corriente' },
  { value: 'ahorro',    labelKey: 'account.category.ahorro' },
  { value: 'inversion', labelKey: 'account.category.inversion' },
  { value: 'etf',       labelKey: 'account.category.etf' },
  { value: 'deposito',  labelKey: 'account.category.deposito' },
  { value: 'inmueble',  labelKey: 'account.category.inmueble' },
  { value: 'vehiculo',  labelKey: 'account.category.vehiculo' },
  { value: 'hucha',     labelKey: 'account.category.hucha' },
  { value: 'credito',   labelKey: 'account.category.credito' },
]

export const LIQUID_CATEGORIES: AccountCategory[] = ['corriente', 'ahorro']
export const HUCHA_CATEGORIES:  AccountCategory[] = ['hucha']
export const INVESTMENT_CATEGORIES: AccountCategory[] = ['inversion', 'etf']
export const DEPRECIABLE_CATEGORIES: AccountCategory[] = ['vehiculo', 'inmueble']
