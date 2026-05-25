import api from './client'

export type AccountCategory = 'corriente' | 'ahorro' | 'inversion' | 'etf' | 'deposito' | 'inmueble'

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
}

export interface AccountsSummary {
  accounts: Account[]
  total: number
}

export const getAccountsSummary = () =>
  api.get<AccountsSummary>('/accounts/summary').then(r => r.data)

export const updateAccount = (id: number, initial_balance: number) =>
  api.put<Account>(`/accounts/${id}`, { initial_balance }).then(r => r.data)

export const updateAccountFull = (id: number, patch: Partial<Pick<Account, 'name' | 'color' | 'icon' | 'initial_balance' | 'category'>>) =>
  api.put<Account>(`/accounts/${id}`, patch).then(r => r.data)

export const createAccount = (body: { name: string; color: string; icon: string; initial_balance: number; category: AccountCategory }) =>
  api.post<Account>('/accounts/', body).then(r => r.data)

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
]

export const LIQUID_CATEGORIES: AccountCategory[] = ['corriente', 'ahorro', 'inversion', 'etf', 'deposito']
