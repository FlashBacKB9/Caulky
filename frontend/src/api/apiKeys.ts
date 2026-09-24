import api from './client'

export interface ApiKey {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export interface ApiKeyCreated extends ApiKey {
  key: string
}

export const getApiKeys = (): Promise<ApiKey[]> =>
  api.get('/api-keys').then(r => r.data)

export const createApiKey = (name: string): Promise<ApiKeyCreated> =>
  api.post('/api-keys', { name }).then(r => r.data)

export const revokeApiKey = (id: number): Promise<void> =>
  api.delete(`/api-keys/${id}`).then(() => undefined)
