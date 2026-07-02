import { useRef, useState, useCallback, useEffect } from 'react'
import { t } from '../../utils/i18n'

export const PALETTE_COLORS = [
  '#6b7280','#ef4444','#f97316','#eab308','#22c55e',
  '#10b981','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899',
]

// ── Shared layout helpers ─────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

export function FadingScrollList({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [atBottom, setAtBottom] = useState(true)

  const check = useCallback(() => {
    const el = ref.current
    if (!el) return
    setOverflows(el.scrollHeight - el.clientHeight > 1)
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 2)
  }, [])

  useEffect(() => {
    check()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [check, children])

  return (
    <div className="relative border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
      <div
        ref={ref}
        onScroll={check}
        className="max-h-40 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflows && !atBottom && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
      )}
    </div>
  )
}

// ── Inline text input ─────────────────────────────────────────────────────────

export function InlineInput({
  value, onChange, onConfirm, onCancel, placeholder, autoFocus = true,
}: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void
  placeholder?: string; autoFocus?: boolean
}) {
  return (
    <input
      type="text" value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
      placeholder={placeholder} autoFocus={autoFocus}
      className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
    />
  )
}

// ── Color swatch picker ───────────────────────────────────────────────────────

export function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-700 shadow ring-1 ring-gray-200 dark:ring-gray-600 transition-transform hover:scale-110"
        style={{ backgroundColor: color }}
        title={t('settings.changeColor')}
      />
      <input
        ref={ref}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0, border: 'none', padding: 0 }}
      />
    </div>
  )
}
