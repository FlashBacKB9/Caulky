import api from './client'
import type { MovementTemplate, TemplateRecurrence } from '../utils/recurringTemplates'

interface ServerTemplate {
  id: number
  label: string
  name: string
  money: string
  date_mode: string
  bank_date_mode: string
  movement_type_id: number | null
  paid: boolean
  no_count: boolean
  notes: string
  recurrence: TemplateRecurrence | null
}

type ServerTemplateInput = Omit<ServerTemplate, 'id'>

export function toMovementTemplate(s: ServerTemplate): MovementTemplate {
  return {
    id: s.id,
    label: s.label,
    name: s.name,
    money: s.money,
    dateMode: s.date_mode as 'today' | 'manual',
    bankDateMode: s.bank_date_mode as 'today' | 'manual',
    movement_type_id: s.movement_type_id != null ? String(s.movement_type_id) : '',
    paid: s.paid,
    no_count: s.no_count,
    notes: s.notes,
    recurrence: s.recurrence ?? undefined,
  }
}

export function toServerInput(t: Omit<MovementTemplate, 'id'>): ServerTemplateInput {
  return {
    label: t.label,
    name: t.name,
    money: t.money,
    date_mode: t.dateMode,
    bank_date_mode: t.bankDateMode,
    movement_type_id: t.movement_type_id ? parseInt(t.movement_type_id) : null,
    paid: t.paid,
    no_count: t.no_count,
    notes: t.notes,
    recurrence: t.recurrence ?? null,
  }
}

export const getTemplates = (): Promise<MovementTemplate[]> =>
  api.get<ServerTemplate[]>('/templates').then(r => r.data.map(toMovementTemplate))

export const createTemplate = (data: Omit<MovementTemplate, 'id'>): Promise<MovementTemplate> =>
  api.post<ServerTemplate>('/templates', toServerInput(data)).then(r => toMovementTemplate(r.data))

export const updateTemplate = (id: number, data: Omit<MovementTemplate, 'id'>): Promise<MovementTemplate> =>
  api.put<ServerTemplate>(`/templates/${id}`, toServerInput(data)).then(r => toMovementTemplate(r.data))

export const deleteTemplate = (id: number): Promise<void> =>
  api.delete(`/templates/${id}`).then(() => undefined)
