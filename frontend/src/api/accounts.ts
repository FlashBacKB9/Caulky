import api from './client'

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
}

export interface AccountsSummary {
  accounts: Account[]
  total: number
}

export const getAccountsSummary = () =>
  api.get<AccountsSummary>('/accounts/summary').then(r => r.data)

export const updateAccount = (id: number, initial_balance: number) =>
  api.put<Account>(`/accounts/${id}`, { initial_balance }).then(r => r.data)

export const updateAccountFull = (id: number, patch: Partial<Pick<Account, 'name' | 'color' | 'icon' | 'initial_balance'>>) =>
  api.put<Account>(`/accounts/${id}`, patch).then(r => r.data)

export const createAccount = (body: { name: string; color: string; icon: string; initial_balance: number }) =>
  api.post<Account>('/accounts/', body).then(r => r.data)

export const deleteAccount = (id: number, opts: { deleteMovements?: boolean; convertToExpense?: boolean } = {}) =>
  api.delete(`/accounts/${id}`, {
    params: {
      delete_movements: opts.deleteMovements ?? false,
      convert_to_expense: opts.convertToExpense ?? false,
    },
  })
