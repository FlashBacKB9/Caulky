import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMovement, deleteMovement, createMovement, type Movement } from '../api/movements'
import { type MovementType } from '../api/movementTypes'
import FileUpload from './FileUpload'
import { X, Trash2, Copy } from 'lucide-react'

export interface DraftRow {
  id: number
  name: string
  money: string
  date: string
  bank_date: string
  movement_type_id: string
  paid: boolean
  no_count: boolean
  notes: string
}

export function toDraft(mv: Movement): DraftRow {
  return {
    id: mv.id,
    name: mv.name,
    money: String(mv.money),
    date: mv.date,
    bank_date: mv.bank_date ?? '',
    movement_type_id: String(mv.movement_type_id ?? ''),
    paid: mv.paid,
    no_count: mv.no_count,
    notes: mv.notes ?? '',
  }
}

export function draftPayload(d: DraftRow, original: Movement) {
  return {
    name: d.name,
    money: parseFloat(d.money) || original.money,
    date: d.date,
    bank_date: d.bank_date || null,
    movement_type_id: d.movement_type_id ? parseInt(d.movement_type_id) : null,
    paid: d.paid,
    no_count: d.no_count,
    notes: d.notes || null,
  }
}

export function duplicatePayload(mv: Movement) {
  return {
    name: mv.name, money: mv.money, date: mv.date,
    bank_date: mv.bank_date, movement_type_id: mv.movement_type_id,
    account_id: mv.account_id, paid: mv.paid, no_count: mv.no_count, notes: mv.notes,
  }
}

export default function MovementDetailModal({ movement, types, onClose }: {
  movement: Movement
  types: MovementType[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<DraftRow>(() => toDraft(movement))
  const { data: accountsSummary } = useQuery({ queryKey: ['accounts-summary'], queryFn: () => import('../api/accounts').then(m => m.getAccountsSummary()) })
  const accounts = accountsSummary?.accounts ?? []
  const setField = <K extends keyof DraftRow>(k: K, v: DraftRow[K]) =>
    setDraft(d => ({ ...d, [k]: v }))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['movements'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['annual'] })
    qc.invalidateQueries({ queryKey: ['accounts-summary'] })
  }

  const updateMut = useMutation({
    mutationFn: (data: object) => updateMovement(movement.id, data),
    onSuccess: () => { invalidate(); onClose() },
  })
  const deleteMut = useMutation({
    mutationFn: () => deleteMovement(movement.id),
    onSuccess: () => { invalidate(); onClose() },
  })
  const duplicateMut = useMutation({
    mutationFn: () => createMovement(duplicatePayload(movement)),
    onSuccess: () => { invalidate(); onClose() },
  })

  const handleDelete = () => {
    if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return
    deleteMut.mutate()
  }

  const IN = 'w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600'
  const TOGGLE = (active: boolean) => `flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Detalle del movimiento</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
            <input className={IN} value={draft.name} onChange={e => setField('name', e.target.value)} />
          </div>

          {/* Importe + Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Importe</label>
              <input type="number" step="0.01" className={IN} value={draft.money} onChange={e => setField('money', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
              <input type="date" className={IN} value={draft.date} onChange={e => setField('date', e.target.value)} />
            </div>
          </div>

          {/* Fecha banco + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha banco</label>
              <input type="date" className={IN} value={draft.bank_date} onChange={e => setField('bank_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
              <select className={IN} value={draft.movement_type_id} onChange={e => setField('movement_type_id', e.target.value)}>
                <option value="">Sin tipo</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {(() => {
                const selType = types.find(t => String(t.id) === draft.movement_type_id)
                const linkedAcc = selType?.linked_account_id ? accounts.find(a => a.id === selType.linked_account_id) : null
                return linkedAcc ? (
                  <div className="mt-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg text-xs text-blue-600 dark:text-blue-400">
                    {parseFloat(draft.money) < 0
                      ? <><span className="font-semibold">{linkedAcc.name}</span> → De uso</>
                      : <>De uso → <span className="font-semibold">{linkedAcc.name}</span></>}
                  </div>
                ) : null
              })()}
            </div>
          </div>

          {/* Pagado / No contar */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pagado</label>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button className={TOGGLE(draft.paid)} onClick={() => setField('paid', true)}>Sí</button>
                <button className={TOGGLE(!draft.paid)} onClick={() => setField('paid', false)}>No</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">No contar</label>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button className={TOGGLE(draft.no_count)} onClick={() => setField('no_count', true)}>Sí</button>
                <button className={TOGGLE(!draft.no_count)} onClick={() => setField('no_count', false)}>No</button>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notas</label>
            <textarea rows={2} className={IN + ' resize-none'} value={draft.notes} onChange={e => setField('notes', e.target.value)} placeholder="Sin notas..." />
          </div>

          {/* Adjuntos */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Adjuntos</label>
            <FileUpload movementId={movement.id} existingFiles={movement.files} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5">
          <button onClick={handleDelete} disabled={deleteMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => duplicateMut.mutate()} disabled={duplicateMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50">
              <Copy className="w-3.5 h-3.5" />
              Duplicar
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Cancelar
            </button>
            <button onClick={() => updateMut.mutate(draftPayload(draft, movement))} disabled={updateMut.isPending}
              className="px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-50">
              {updateMut.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
