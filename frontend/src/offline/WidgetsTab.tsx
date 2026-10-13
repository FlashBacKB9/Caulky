import { useState, type CSSProperties } from 'react'
import { Check, Plus } from 'lucide-react'
import { Section } from '../pages/settings/shared'
import { readWidgetStyle, saveWidgetStyle, WIDGET_PRESETS, type WidgetStyle } from './widgets'

/** Ajustes → Widgets (solo en la APK): colores de los widgets del escritorio. */

const COLOR_FIELDS: { key: keyof WidgetStyle; label: string }[] = [
  { key: 'bg', label: 'Fondo' },
  { key: 'text', label: 'Texto' },
  { key: 'muted', label: 'Texto secundario' },
  { key: 'accent', label: 'Botón y barras' },
  { key: 'accentText', label: 'Símbolo del botón' },
  { key: 'track', label: 'Fondo de las barras' },
  { key: 'over', label: 'Pasado de presupuesto' },
]

/** #RRGGBB o #AARRGGBB (formato Android) → color CSS */
function css(color: string): string {
  if (/^#[0-9a-f]{8}$/i.test(color)) {
    const a = parseInt(color.slice(1, 3), 16) / 255
    return `rgba(${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${parseInt(color.slice(7, 9), 16)}, ${a.toFixed(2)})`
  }
  return color
}

function bgCss(s: WidgetStyle): string {
  const hex = s.bg.length === 9 ? '#' + s.bg.slice(3) : s.bg
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(s.bgAlpha / 255).toFixed(2)})`
}

/** Vista previa aproximada de los widgets con estos colores */
function Preview({ s }: { s: WidgetStyle }) {
  const card: CSSProperties = { background: bgCss(s), borderRadius: 20, fontFamily: 'monospace' }
  return (
    <div className="rounded-2xl p-3 grid grid-cols-[72px_1fr] gap-3"
      style={{ background: 'linear-gradient(135deg, #64748b, #1e293b)' }}>
      <div className="flex flex-col gap-3">
        <div className="h-[72px] flex items-center justify-center" style={card}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: css(s.accent) }}>
            <Plus className="w-5 h-5" strokeWidth={2.5} style={{ color: css(s.accentText) }} />
          </span>
        </div>
        <div className="h-[72px] flex flex-col items-center justify-center px-1" style={card}>
          <span className="text-[8px] uppercase" style={{ color: css(s.muted) }}>Cuentas</span>
          <span className="text-sm font-bold" style={{ color: css(s.text) }}>22,2k€</span>
          <span className="text-[8px]" style={{ color: css(s.muted) }}>Total</span>
        </div>
      </div>
      <div className="p-3 flex flex-col" style={card}>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: css(s.muted) }}>Presupuestos</span>
        <span className="text-lg font-bold" style={{ color: css(s.text) }}>85% Ocio</span>
        <span className="text-[10px] mb-2" style={{ color: css(s.muted) }}>1 pasado del límite</span>
        {[{ n: 'Ocio', p: 85, o: false }, { n: 'Comida', p: 100, o: true }, { n: 'Ropa', p: 30, o: false }].map(r => (
          <div key={r.n} className="mb-1.5">
            <div className="flex justify-between text-[10px]">
              <span style={{ color: css(s.text) }}>{r.n}</span>
              <span style={{ color: css(r.o ? s.over : s.muted) }}>{r.p}%</span>
            </div>
            <div className="h-1.5 rounded-full mt-0.5" style={{ background: css(s.track) }}>
              <div className="h-full rounded-full" style={{ width: `${r.p}%`, background: css(r.o ? s.over : s.accent) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WidgetsTab() {
  const [style, setStyle] = useState<WidgetStyle>(readWidgetStyle)
  const presetId = WIDGET_PRESETS.find(p => JSON.stringify(p.style) === JSON.stringify(style))?.id

  const apply = (next: WidgetStyle) => { setStyle(next); saveWidgetStyle(next) }

  return (
    <>
      <Section title="Widgets del escritorio">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Mantén pulsado el escritorio del móvil → Widgets → Caulky. Hay widgets de Añadir rápido, Cuentas,
          Presupuestos y Este mes; todos se pueden estirar y enseñan más cuanto más grandes.
          Los colores de aquí se aplican a todos.
        </p>
        <Preview s={style} />
      </Section>

      <Section title="Estilo">
        <div className="grid grid-cols-2 gap-2">
          {WIDGET_PRESETS.map(p => (
            <button key={p.id} onClick={() => apply(p.style)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                presetId === p.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-gray-900 dark:text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}>
              <span className="w-5 h-5 rounded-md border border-black/10 shrink-0" style={{ background: bgCss(p.style) }} />
              <span className="flex-1">{p.name}</span>
              {presetId === p.id && <Check className="w-4 h-4 text-blue-500" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colores personalizados">
        <div className="space-y-2">
          {COLOR_FIELDS.map(f => {
            const value = String(style[f.key])
            const hex = value.length === 9 ? '#' + value.slice(3) : value
            return (
              <label key={f.key} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
                <input type="color" value={hex}
                  onChange={e => apply({ ...style, [f.key]: e.target.value.toUpperCase() })}
                  className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-0.5 shrink-0" />
                <span className="flex-1">{f.label}</span>
                <span className="font-mono text-xs text-gray-400">{hex.toUpperCase()}</span>
              </label>
            )
          })}
          <label className="block pt-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="flex justify-between mb-1">
              <span>Opacidad del fondo</span>
              <span className="font-mono text-xs text-gray-400">{Math.round(style.bgAlpha / 2.55)}%</span>
            </span>
            <input type="range" min={0} max={255} value={style.bgAlpha}
              onChange={e => apply({ ...style, bgAlpha: Number(e.target.value) })}
              className="w-full accent-blue-500" />
          </label>
        </div>
      </Section>
    </>
  )
}
