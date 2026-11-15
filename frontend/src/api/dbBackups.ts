import api from './client'

export interface DbCopy {
  name: string
  taken_at: string          // hora local del servidor, sin zona
  kind: 'diaria' | 'antes de restaurar'
  size: number
  confirm: string           // fecha que hay que escribir para volver a ella (dd/mm/aaaa)
}

export interface RestoreStatus {
  estado?: 'en_curso' | 'ok' | 'error'
  fichero?: string
  seguro?: string
  fin?: string
  error?: string
  pending: boolean
}

export interface DbBackupsOverview {
  available: boolean
  items: DbCopy[]
  keep_daily: number
  keep_safety: number
  location: string
  last_daily: string | null
  stale: boolean
  restore: RestoreStatus | null
}

export const getDbBackups = () =>
  api.get<DbBackupsOverview>('/db-backups').then(r => r.data)

export const getRestoreStatus = () =>
  api.get<{ restore: RestoreStatus | null }>('/db-backups/restore-status', { timeout: 5000 }).then(r => r.data.restore)

export const restoreDbBackup = (name: string, confirm: string) =>
  api.post<{ ok: boolean; restarting: boolean }>('/db-backups/restore', { name, confirm }).then(r => r.data)

export const dbBackupFileUrl = (name: string) =>
  `${api.defaults.baseURL ?? ''}/db-backups/file/${encodeURIComponent(name)}`
