import { useRef, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Upload, Trash2, Receipt, ChevronDown, ChevronUp, AlertCircle, Loader2 } from 'lucide-react'
import { analyzeTicket, getTickets, deleteTicket, type Ticket } from '../api/tickets'

// ── Palette ────────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899',
  '#14b8a6','#f97316','#8b5cf6','#22c55e','#e11d48','#0ea5e9',
  '#a855f7','#84cc16','#06b6d4','#fbbf24','#f43f5e','#34d399',
  '#818cf8','#fb923c','#a3e635','#38bdf8','#c084fc','#4ade80',
  '#f472b6','#2dd4bf',
]

// ── Upload area ────────────────────────────────────────────────────────────────

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handle = (f: File) => {
    if (f) onFile(f)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none
        ${dragging
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-900'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f) }}
    >
      <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Sube una foto o PDF del ticket</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, PDF · máx. 10 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = '' }}
      />
    </div>
  )
}

// ── Ticket card ────────────────────────────────────────────────────────────────

function TicketCard({ ticket, onDelete }: { ticket: Ticket; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const dateLabel = ticket.ticket_date
    ? new Date(ticket.ticket_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Receipt className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
            {ticket.store_name ?? ticket.original_name}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {[dateLabel, ticket.total != null ? `${ticket.total.toFixed(2)} €` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          onClick={onDelete}
          title="Eliminar ticket"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={() => setOpen(v => !v)}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {open && ticket.items.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {ticket.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <td className="py-1 text-gray-700 dark:text-gray-300">{item.name}</td>
                  <td className="py-1 text-gray-400 dark:text-gray-500 px-2">{item.category}</td>
                  <td className="py-1 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">{item.amount.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && ticket.items.length === 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 text-xs text-gray-400">
          No se detectaron productos en este ticket.
        </div>
      )}
    </div>
  )
}

// ── Category chart ─────────────────────────────────────────────────────────────

function CategoryChart({ tickets }: { tickets: Ticket[] }) {
  const data = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const t of tickets) {
      for (const [cat, amt] of Object.entries(t.categories)) {
        totals[cat] = (totals[cat] ?? 0) + amt
      }
    }
    const grand = Object.values(totals).reduce((a, b) => a + b, 0)
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value: Math.round(value * 100) / 100,
        pct: grand > 0 ? Math.round((value / grand) * 1000) / 10 : 0,
        color: COLORS[i % COLORS.length],
      }))
  }, [tickets])

  if (data.length === 0) return null

  const grand = data.reduce((a, b) => a + b.value, 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">
        Desglose por categoría — {grand.toFixed(2)} €
      </h2>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 h-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} €`]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 content-start">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{d.name}</span>
              <span className="text-xs font-medium text-gray-800 dark:text-white whitespace-nowrap">
                {d.pct}%
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{d.value.toFixed(2)} €</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Tickets() {
  const qc = useQueryClient()
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: getTickets,
  })

  const analyzeMut = useMutation({
    mutationFn: analyzeTicket,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); setUploadError(null) },
    onError: () => setUploadError('Error al analizar el ticket. Comprueba que Tesseract OCR está instalado en el servidor.'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Tickets</h1>
      </div>

      <div className="relative">
        <UploadArea onFile={f => { setUploadError(null); analyzeMut.mutate(f) }} />
        {analyzeMut.isPending && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 rounded-xl flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Analizando ticket…</span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}

      {tickets.length > 0 && (
        <>
          <CategoryChart tickets={tickets} />
          <div className="space-y-2">
            {tickets.map(t => (
              <TicketCard
                key={t.id}
                ticket={t}
                onDelete={() => deleteMut.mutate(t.id)}
              />
            ))}
          </div>
        </>
      )}

      {tickets.length === 0 && !analyzeMut.isPending && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          Aún no has subido ningún ticket. Sube una foto o PDF para empezar.
        </p>
      )}
    </div>
  )
}
