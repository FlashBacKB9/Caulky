import api from './client'
import { isNative, offlineEnabled } from '../offline/platform'
import { clearOfflineData } from '../offline/session'

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
  // En la APK las peticiones van por HTTP nativo: un formulario urlencoded es lo más seguro
  if (isNative) {
    return api.post('/auth/login', new URLSearchParams({ username: email, password }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  }
  const form = new FormData()
  form.append('username', email)
  form.append('password', password)
  return api.post('/auth/login', form)
}

export const logout = async () => {
  if (offlineEnabled) await clearOfflineData()
  return api.post('/auth/logout')
}

export const register = (email: string, password: string, displayName?: string) =>
  api.post<UserRead>('/auth/register', { email, password, display_name: displayName ?? null })

export const claimData = () => api.post('/admin/claim')

export const setupDemo = () =>
  api.post<{ email: string; password: string }>('/demo/setup').then(r => r.data)
