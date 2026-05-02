import api from './client'

export const getDashboard = (year?: number, month?: number) =>
  api.get('/stats/dashboard', { params: { year, month } }).then(r => r.data)

export const getAnnualStats = (year?: number) =>
  api.get('/stats/annual', { params: { year } }).then(r => r.data)
