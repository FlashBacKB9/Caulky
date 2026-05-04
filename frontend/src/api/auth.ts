import api from './client'

export interface UserRead {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  display_name: string | null
}

export const getMe = () =>
  api.get<UserRead>('/users/me').then(r => r.data)

export const login = (email: string, password: string) => {
  const form = new FormData()
  form.append('username', email)
  form.append('password', password)
  return api.post('/auth/cookie/login', form)
}

export const logout = () => api.post('/auth/cookie/logout')

export const register = (email: string, password: string, displayName?: string) =>
  api.post<UserRead>('/auth/register', { email, password, display_name: displayName ?? null })

export const claimData = () => api.post('/admin/claim')
