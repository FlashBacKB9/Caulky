import api from './client'

/** Ajustes de toda la instalación; solo los ve y cambia el administrador. */
export interface AdminSettings {
  registration_open: boolean
  ai_terminal_enabled: boolean
}

export const getPublicSettings = () =>
  api.get<{ registration_open: boolean }>('/admin/public-settings').then(r => r.data)

export const getAdminSettings = () =>
  api.get<AdminSettings>('/admin/settings').then(r => r.data)

export const updateAdminSettings = (data: AdminSettings) =>
  api.put<AdminSettings>('/admin/settings', data).then(r => r.data)
