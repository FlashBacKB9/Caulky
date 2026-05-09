import api from './client'

export const getAllPreferences = (): Promise<Record<string, string>> =>
  api.get('/preferences').then(r => r.data)

export const setPreference = (key: string, value: string): Promise<void> =>
  api.put(`/preferences/${encodeURIComponent(key)}`, { value }).then(() => undefined)
