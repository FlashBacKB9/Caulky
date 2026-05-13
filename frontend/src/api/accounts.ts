import api from './client'

export type AccountCategory = 'corriente' | 'ahorro' | 'inversion' | 'etf' | 'deposito'

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

export const ACCOUNT_CATEGORIES: { value: AccountCategory; label: string }[] = [
  { value: 'corriente', label: 'Corriente' },
  { value: 'ahorro',    label: 'Ahorro' },
  { value: 'inversion', label: 'Inversión' },
  { value: 'etf',       label: 'ETFs' },
  { value: 'deposito',  label: 'Depósito' },
]
