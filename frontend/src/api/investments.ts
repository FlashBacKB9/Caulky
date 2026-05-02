import api from './client'

export interface InvestmentPurchase {
  movement_id: number
  date: string
  bank_date: string | null
  amount_eur: number
  notes: string | null
  price_at_purchase: number | null
  units: number | null
}

export interface InvestmentFund {
  id: number
  name: string
  ticker: string | null
  color: string
  notes: string | null
  movement_type_id: number | null
  current_price: number | null
  current_value_override: number | null
  total_invested: number
  total_units: number | null
  current_value: number | null
  gain_eur: number | null
  gain_pct: number | null
  purchases: InvestmentPurchase[]
}

export interface InvestmentSummary {
  total_invested: number
  total_current_value: number | null
  gain_eur: number | null
  gain_pct: number | null
}

export const getFunds   = () => api.get<InvestmentFund[]>('/investments/funds').then(r => r.data)
export const getSummary = () => api.get<InvestmentSummary>('/investments/summary').then(r => r.data)

export const createFund = (body: { name: string; ticker?: string; color: string; notes?: string; movement_type_id?: number | null }) =>
  api.post<InvestmentFund>('/investments/funds', body).then(r => r.data)

export const updateFund = (id: number, patch: Partial<{
  name: string; ticker: string | null; color: string; notes: string | null
  movement_type_id: number | null; current_price: number | null; current_value_override: number | null
}>) => api.put<InvestmentFund>(`/investments/funds/${id}`, patch).then(r => r.data)

export const deleteFund     = (id: number) => api.delete(`/investments/funds/${id}`)
export const fetchFundPrice = (id: number) => api.post<InvestmentFund>(`/investments/funds/${id}/fetch-price`).then(r => r.data)

export const upsertPurchaseSupplement = (movement_id: number, data: { price_at_purchase?: number | null; units?: number | null }) =>
  api.put<InvestmentPurchase>(`/investments/purchases/${movement_id}`, data).then(r => r.data)

export const deletePurchaseSupplement = (movement_id: number) =>
  api.delete(`/investments/purchases/${movement_id}`)

export const fetchPurchasePrice = (movement_id: number) =>
  api.post<InvestmentPurchase>(`/investments/purchases/${movement_id}/fetch-price`).then(r => r.data)
