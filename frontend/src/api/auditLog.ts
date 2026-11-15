import api from './client'

export interface AuditLogEntry {
  id: number
  created_at: string
  entity_type: string
  entity_id: number | null
  action: string
  summary: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export const getAuditLog = (params?: { limit?: number; offset?: number }) =>
  api.get<AuditLogEntry[]>('/audit-log', { params }).then(r => r.data)

export const clearAuditLog = () =>
  api.delete('/audit-log')

// ── Operaciones (una transacción) y deshacer ──────────────────────────────────

export interface AuditRow {
  id: number
  table: string
  action: 'insert' | 'update' | 'delete'
  row_id: string
  label: string
  changes: Record<string, [unknown, unknown]> | null
  data: Record<string, unknown>
  restored_at: string | null
  bundle: number | null
}

/** ok: se puede deshacer · partial: deshecha en parte · done: deshecha · undo: es un deshacer ·
 *  old: no se puede (registrada antes, o pasados 90 días) · none: no hay nada que deshacer */
export type OperationState = 'ok' | 'partial' | 'done' | 'undo' | 'old' | 'none'

export interface AuditOperation {
  key: string
  group_id: string | null
  last_id: number
  created_at: string
  source: string
  summaries: { id: number; action: string; entity_type: string; summary: string }[]
  counts: { table: string; action: string; count: number; restored: number }[]
  total_rows: number
  rows_left: number
  bundles: number | null
  rows: AuditRow[]
  state: OperationState
  reason: string | null
}

export const getOperations = (before?: number) =>
  api.get<{ operations: AuditOperation[]; next_before: number | null }>('/audit-log/operations', {
    params: before ? { before } : undefined,
  }).then(r => r.data)

export const undoOperation = (body: { group_id?: string; ids?: number[] }) =>
  api.post<{ undone: number; rows?: number }>('/audit-log/undo', body).then(r => r.data)
