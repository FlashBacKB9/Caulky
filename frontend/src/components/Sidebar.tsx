import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Wallet, Settings, Info, X, ExternalLink, LogOut, ChevronLeft, ChevronRight, ChevronDown, Calculator } from 'lucide-react'
import CalculatorModal from './CalculatorModal'
import { useNavConfig, PAGE_META } from '../hooks/useNavConfig'
import { logout } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { queryClient } from '../App'
import { t } from '../utils/i18n'

// ── Changelog data ────────────────────────────────────────────────────────────

interface ChangelogEntry { version: string; date: string; items: { type: 'feat' | 'fix' | 'improve'; text: string }[] }

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.9', date: 'Julio 2026',
    items: [
      { type: 'feat',    text: 'Cuentas remuneradas: marca una cuenta como remunerada en Ajustes → Cuentas, elige el subtipo del abono de intereses y la retención, y en Inversiones aparece una pestaña con el saldo mes a mes, los intereses de cada mes y el tipo anual real (bruto sobre el saldo del mes anterior) para contrastarlo con el de tu banco' },
      { type: 'feat',    text: 'Plantillas: ahora puedes elegir la cuenta a la que corresponde el movimiento, y se respeta al aplicarla y en las recurrencias automáticas' },
      { type: 'fix',     text: 'Movimientos de una cuenta: los importes se muestran desde la perspectiva de esa cuenta (el traspaso a Ahorro suma en Ahorro y resta en la de uso) y la columna de saldo lleva el nombre de la cuenta en vez de «Saldo de uso»' },
      { type: 'feat',    text: 'Control de Gastos es ahora Control de Gastos e Ingresos: pestaña Gastos/Ingresos junto al título, con el mismo análisis en ambos modos (en Ingresos entran los movimientos de tipo ingreso y las devoluciones de cualquier tipo)' },
      { type: 'feat',    text: 'Calculadora flotante: botón en la barra lateral que abre una calculadora arrastrable con historial, y se queda flotando mientras navegas por la app' },
      { type: 'improve', text: 'Control de Gastos e Ingresos: el tooltip de la evolución mensual oculta las categorías a 0 € y ordena de mayor a menor; la leyenda y la tabla solo muestran los tipos con importe' },
      { type: 'improve', text: '«Acerca de» se muestra solo dentro de Configuración, dejando el hueco a la calculadora en el resto de la app' },
      { type: 'feat',    text: 'Cuentas reales: agrupa tus cuentas por entidad bancaria (Ajustes → Cuentas) para conciliar los saldos de la app con los del banco' },
      { type: 'feat',    text: 'Modo privado: oculta todos los importes de la app con un solo toque' },
      { type: 'feat',    text: 'Modo test: acceso con datos de ejemplo (≈3,5 años) para explorar la app sin tocar tus datos' },
      { type: 'feat',    text: 'Tickets: reescaneo eligiendo el modelo de IA, con precio unitario editable y cantidad por línea (el importe se calcula solo)' },
      { type: 'improve', text: 'Añadir movimiento rápido: pega (Ctrl+V) o arrastra imágenes para adjuntarlas al movimiento o al ticket' },
      { type: 'fix',     text: 'Tickets: los productos vuelven a extraerse (el análisis descartaba todas las líneas por un cambio en el formato de la IA)' },
      { type: 'fix',     text: 'Análisis: el mayor tipo de gasto y el gasto por categoría muestran el nombre del tipo (Moto, Suscripciones…) en vez del grupo genérico «Gasto»' },
      { type: 'fix',     text: 'Análisis – Heatmap de gastos: ya no suma el ahorro, las inversiones, los movimientos «no contar» ni los excluidos manualmente; usa los mismos gastos reales que el resto de la sección' },
      { type: 'fix',     text: 'Presupuestos: las devoluciones (importe negativo) restan del gasto del periodo' },
      { type: 'fix',     text: 'Dashboard: los widgets de presupuesto usan el mismo límite y periodo que la página de Presupuestos' },
      { type: 'fix',     text: 'Dashboard – Gastos por categoría: las devoluciones se descuentan del gasto (250 gastados − 125 devueltos = 125, antes 375); el tooltip oculta las categorías a 0 y agrupa las menores de 20 € en «Otros»; el donut junta las porciones menores del 10% en «Otros»' },
      { type: 'fix',     text: 'Cuentas reales: corregido el botón de guardar y un error al crear o editar una cuenta real' },
      { type: 'fix',     text: 'Modo demo: los gastos de ejemplo tienen el signo correcto y los datos se regeneran de forma fiable' },
      { type: 'fix',     text: 'Deudas y Huchas: la configuración se guarda en el servidor (antes solo en el navegador, se perdía al limpiar la caché o cambiar de dispositivo)' },
    ],
  },
  {
    version: 'v1.8', date: 'Mayo 2026',
    items: [
      { type: 'feat',    text: 'Nuevo módulo Huchas: cuentas de tipo hucha con objetivo, fecha límite y proyecciones (cuánto aportar al mes o cuándo llegarás)' },
      { type: 'feat',    text: 'Nuevo módulo Deudas: hipotecas y préstamos con cuadro de amortización, capital pendiente, intereses y vinculación a un inmueble o vehículo' },
      { type: 'feat',    text: 'Deudas: simulador de amortización anticipada con importe extra, frecuencia, condición de líquido mínimo y gráfico comparativo' },
      { type: 'feat',    text: 'Deudas: genera automáticamente una plantilla mensual del pago, y la cuenta vinculada muestra su equity (valor menos deuda pendiente)' },
      { type: 'feat',    text: 'Suscripciones: marca subtipos como suscripción (mensual/anual) en Ajustes y velas en Control de Gastos divididas en activas/inactivas, con historial y coste anual' },
      { type: 'feat',    text: 'Análisis: heatmap de gastos anual estilo calendario de contribuciones' },
      { type: 'feat',    text: 'Alertas de presupuesto: campana flotante global con panel desplegable; se descartan al verlas y reaparecen solo si el gasto sube otro 10%' },
      { type: 'feat',    text: 'Adjuntos: visor integrado para PDF e imágenes con zoom y descarga, sin salir de la app' },
      { type: 'improve', text: 'Configuración reorganizada en pestañas (Cuentas, Apariencia, Suscripciones, Tickets…)' },
      { type: 'improve', text: 'Calendario: nombre del mes con mayúscula inicial' },
      { type: 'improve', text: 'Formulario de movimiento: el selector de tipo incluye los grupos personalizados y tinta cada opción con su color' },
      { type: 'fix',     text: 'Numerosos ajustes de responsividad móvil en Cuentas, Inversiones, Dashboard, Calendario y Presupuestos' },
    ],
  },
  {
    version: 'v1.7.2', date: 'Mayo 2026',
    items: [
      { type: 'improve', text: 'Configuración: nuevo menú de pestañas superior (Cuentas, Apariencia, Movimientos, Navegación, Backup, Tickets, Plugins, Sistema)' },
      { type: 'fix',     text: 'Presupuestos: umbral rojo a partir del 105% (antes 100%), permitiendo llegar al límite sin alarma' },
      { type: 'fix',     text: 'Móvil – Calendario: celdas con overflow-hidden, altura reducida y máximo 2 eventos visibles por celda' },
      { type: 'fix',     text: 'Móvil – Cuentas: composición e inversiones se apilan bajo el patrimonio total en lugar de quedar en fila' },
      { type: 'fix',     text: 'Móvil – Inversiones: badge de ganancia en línea propia bajo el nombre del fondo' },
      { type: 'fix',     text: 'Móvil – Dashboard: todos los widgets a ancho completo respetando el orden de personalización' },
      { type: 'fix',     text: 'Móvil – Presupuestos: tabla de historial con scroll horizontal' },
    ],
  },
  {
    version: 'v1.7.1', date: 'Mayo 2026',
    items: [
      { type: 'fix',     text: 'Dashboard: los widgets se actualizan tras crear un movimiento sin recargar la página' },
      { type: 'fix',     text: 'Inversiones: las fechas de compra respetan el formato de fecha configurado en ajustes' },
      { type: 'fix',     text: 'Transferencias: se guarda y muestra el subtipo asociado a la cuenta destino en calendario y filtros' },
      { type: 'fix',     text: 'Regla 50/30/20: el cubo Ahorro/Inv. aparece correctamente en el gráfico y en los porcentajes' },
      { type: 'fix',     text: 'Regla 50/30/20: el color es verde si supera el objetivo de ahorro y rojo si queda por debajo (lógica invertida respecto a Necesidades/Deseos)' },
      { type: 'improve', text: 'Análisis: Mayor tipo de gasto agrupa todos los movimientos de la misma categoría (no el movimiento individual mayor)' },
      { type: 'improve', text: 'Análisis: "Proyección de Patrimonio" renombrada a "Proyección de Líquido" y usa solo saldo corriente + ahorro' },
      { type: 'improve', text: 'Filtro de subtipos: dropdown flotante sin barra de scroll, difuminado inferior y selección por bloque completo' },
    ],
  },
  {
    version: 'v1.7.0', date: 'Mayo 2026',
    items: [
      { type: 'feat',    text: 'Control de Gastos: nuevo módulo con evolución mensual por tipo, comparativa multi-año, modos barra/área/línea, apilado y acumulado' },
      { type: 'feat',    text: 'Control de Gastos: vista tabla (tipos × meses) con comparativa por año (Δ%) y toggle Por mes / Anual' },
      { type: 'feat',    text: 'Control de Gastos: paletas de colores automáticas (Vivos, Pastel, Tierra, Océano, Bosque) con pickers individuales por tipo' },
      { type: 'feat',    text: 'Tickets: pestaña Análisis con gráficos de gasto por categoría, evolución mensual y desglose con filtros de fecha' },
      { type: 'feat',    text: 'Tickets: OCR con Gemini (free tier) y cadena de fallback automática Gemini → Mistral → Tesseract' },
      { type: 'improve', text: 'Tooltips de gráficos con soporte correcto de modo oscuro (fondo, borde y texto adaptados)' },
      { type: 'fix',     text: 'Etiqueta de navegación "Control de Gastos" mostraba la clave i18n en vez del texto' },
    ],
  },
  {
    version: 'v1.6.0', date: 'Mayo 2026',
    items: [
      { type: 'feat',    text: 'Multi-cuenta: transferencias entre cuentas, balance combinado y filtro por cuenta en movimientos' },
      { type: 'feat',    text: 'Plantillas: icono de recurrencia inline (filas más compactas), opción "Si cae en fin de semana → Viernes/Lunes"' },
      { type: 'feat',    text: 'Plantillas: recurrencia mensual permite día 1–31 (antes máx. 28); se ajusta al último día real del mes' },
      { type: 'feat',    text: 'Calendario: click en una cita fantasma la crea como movimiento real; borrarla restaura el fantasma para auto-generación' },
      { type: 'fix',     text: 'Menú contextual del calendario desplazado por el zoom CSS — ahora aparece exactamente en el cursor' },
      { type: 'fix',     text: 'Autocomplete y plugins del navegador (Bitwarden, etc.) ya no aparecen desplazados en el login' },
      { type: 'improve', text: 'Editor de plantilla/recurrencia ocupa todo el ancho del modal (sin sidebar lateral durante la edición)' },
    ],
  },
  {
    version: 'v1.5.0', date: 'Mayo 2026',
    items: [
      { type: 'feat',    text: 'Cuentas: categoría "Vehículo" con depreciación lineal configurable y opción de depreciación inmediata para coches nuevos (−15%)' },
      { type: 'feat',    text: 'Patrimonio Total: suma valor real de inversiones (precio de mercado) más bienes (inmuebles y vehículos con valor actual)' },
      { type: 'feat',    text: 'Cuentas: barra de composición segmentada (Líquido / Inversiones / Bienes) y desglose de ganancia de inversión con estimación IRPF' },
      { type: 'feat',    text: 'Bienes: botón ojo por tarjeta para incluir/excluir del patrimonio total individualmente' },
      { type: 'feat',    text: 'Click en cualquier tarjeta de cuenta navega a la vista de movimientos filtrada por esa cuenta' },
      { type: 'feat',    text: 'Movimientos: ordenación multi-columna con panel avanzado (prioridades, reordenar, dirección)' },
      { type: 'improve', text: 'Etiquetas de orden contextuales: numérico (1→9), fecha (Antiguo/Reciente), booleano (Sí/No), texto (A→Z)' },
    ],
  },
  {
    version: 'v1.4.0', date: 'Febrero 2026',
    items: [
      { type: 'feat',    text: 'Presupuestos: día de inicio de periodo configurable (mensual: día 1–31; semanal: día de la semana)' },
      { type: 'feat',    text: 'Presupuestos: fila del periodo actual resaltada y rango de fechas visible en la tabla' },
      { type: 'feat',    text: 'Dashboard: widget de presupuestos muestra importe restante' },
      { type: 'feat',    text: 'Cuentas: delta de variación anual tiene en cuenta el año seleccionado' },
      { type: 'feat',    text: 'Calendario: suma total diaria visible a la izquierda del número de día' },
      { type: 'improve', text: 'Inversiones: estimación de IRPF sobre ganancias con tramos españoles (19%–28%)' },
    ],
  },
  {
    version: 'v1.3.0', date: 'Noviembre 2025',
    items: [
      { type: 'feat',    text: 'Consultor IA integrado: chat con modelos de lenguaje con acceso a contexto de la app y sesiones persistentes' },
      { type: 'feat',    text: 'Módulo de Inversiones: seguimiento de fondos con precios Yahoo Finance, ganancia bruta y porcentual' },
      { type: 'feat',    text: 'Historial de auditoría de movimientos con saldo de cuenta antes/después' },
      { type: 'feat',    text: 'Búsqueda rápida por nombre en la vista tabla de movimientos' },
      { type: 'improve', text: 'Filtros favoritos guardados por nombre para reutilizar en cualquier sesión' },
    ],
  },
  {
    version: 'v1.2.1', date: 'Septiembre 2025',
    items: [
      { type: 'fix', text: 'Corrección de zona horaria en cálculo de fechas de periodo de presupuestos' },
      { type: 'fix', text: 'Enlace de navegación interna en el Consultor IA reparado' },
      { type: 'fix', text: 'Símbolo de moneda sin espacio entre número y símbolo' },
    ],
  },
  {
    version: 'v1.2.0', date: 'Agosto 2025',
    items: [
      { type: 'feat',    text: 'Vista Kanban de movimientos agrupada por tipo con columnas colapsables' },
      { type: 'feat',    text: 'Gráficos personalizables: editor visual con combinaciones de dimensiones, tipos y series' },
      { type: 'feat',    text: 'Comparaciones: comparar dos años con barras, líneas o tabla por categoría' },
      { type: 'feat',    text: 'Exportación CSV de movimientos seleccionados con campos configurables' },
      { type: 'feat',    text: 'Gastos compartidos: campo para dividir un gasto entre varias personas' },
      { type: 'improve', text: 'Menú lateral completamente configurable: orden, visibilidad por página' },
    ],
  },
  {
    version: 'v1.0', date: 'Julio 2025',
    items: [
      { type: 'feat', text: 'Lanzamiento inicial de Caulky' },
      { type: 'feat', text: 'Movimientos: CRUD completo, vista tabla con filtros avanzados y vista calendario mensual' },
      { type: 'feat', text: 'Cuentas bancarias con saldo inicial y evolución histórica' },
      { type: 'feat', text: 'Tipos y grupos de movimiento con colores personalizados' },
      { type: 'feat', text: 'Plantillas con recurrencias: diaria, semanal, mensual por día o día de semana' },
      { type: 'feat', text: 'Presupuestos por tipo con periodos y versiones de importe' },
      { type: 'feat', text: 'Dashboard configurable con widgets drag-and-drop' },
      { type: 'feat', text: 'Importación de movimientos desde Excel (.xlsx)' },
      { type: 'feat', text: 'Internacionalización: ES, EN, FR, DE, IT + sistema de plugins de idioma' },
      { type: 'feat', text: 'Builds standalone para Windows, Linux y macOS vía GitHub Actions' },
    ],
  },
]

const BADGE = {
  feat:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  fix:     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  improve: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
}
const BADGE_LABEL = { feat: 'Nueva', fix: 'Fix', improve: 'Mejora' }

// ── Accordion section inside InfoModal ────────────────────────────────────────

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-100 dark:border-gray-800 first:border-t-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-2.5 text-left group"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">{title}</p>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto overscroll-y-contain scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t('about.title')}</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">v1.8</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-0 text-sm">
          {/* Desarrollado por — always visible */}
          <div className="pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">{t('about.developedBy')}</p>
            <a
              href="https://github.com/FlashBacKB9"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            >
              <span className="font-medium text-gray-800 dark:text-gray-100">FlashBacKB9</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>

          {/* APIs externas */}
          <InfoSection title={t('about.externalApis')}>
            <div className="space-y-1.5">
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-100">Yahoo Finance</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('about.yahooDesc')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">query1.finance.yahoo.com</p>
              </div>
              <div className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="font-medium text-gray-800 dark:text-gray-100">Google Fonts</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('about.googleDesc')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">fonts.googleapis.com</p>
              </div>
            </div>
          </InfoSection>

          {/* Frontend */}
          <InfoSection title={t('about.frontend')}>
            <div className="space-y-1.5">
              {[
                { name: 'React + TypeScript', desc: t('about.reactDesc') },
                { name: 'Vite', desc: t('about.viteDesc') },
                { name: 'TanStack Query', desc: t('about.tanstackDesc') },
                { name: 'React Router', desc: t('about.routerDesc') },
                { name: 'Tailwind CSS v4', desc: t('about.tailwindDesc') },
                { name: 'Lucide React', desc: t('about.lucideDesc') },
                { name: 'Axios', desc: t('about.axiosDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </InfoSection>

          {/* Backend */}
          <InfoSection title={t('about.backend')}>
            <div className="space-y-1.5">
              {[
                { name: 'FastAPI', desc: t('about.fastapiDesc') },
                { name: 'SQLAlchemy 2.0', desc: t('about.sqlalchemyDesc') },
                { name: 'PostgreSQL', desc: t('about.postgresDesc') },
                { name: 'Alembic', desc: t('about.alembicDesc') },
                { name: 'Pydantic v2', desc: t('about.pydanticDesc') },
                { name: 'httpx', desc: t('about.httpxDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </InfoSection>

          {/* Extensibilidad */}
          <InfoSection title={t('about.extensibility')}>
            <div className="space-y-1.5">
              {[
                { name: 'Plugins', desc: t('about.pluginsDesc') },
                { name: 'Skins', desc: t('about.skinsDesc') },
                { name: 'Idiomas', desc: t('about.langsDesc') },
              ].map(item => (
                <div key={item.name} className="flex items-baseline gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-100 shrink-0">{item.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </InfoSection>

          {/* Historial de versiones */}
          <InfoSection title="Historial de versiones">
            <div className="space-y-5">
              {CHANGELOG.map(entry => (
                <div key={entry.version}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{entry.version}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{entry.date}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE[item.type]}`}>
                          {BADGE_LABEL[item.type]}
                        </span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </InfoSection>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({
  isOpen,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const navEntries = useNavConfig()
  const [showInfo, setShowInfo] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const inSettings = pathname.startsWith('/settings')

  async function handleLogout() {
    await logout().catch(() => {})
    queryClient.clear()
    setUser(null)
    navigate('/login', { replace: true })
  }

  const visibleLinks = navEntries
    .filter(e => e.visible && PAGE_META[e.id])
    .map(e => ({ to: e.id, ...PAGE_META[e.id] }))

  const linkCls = (isActive: boolean) =>
    `flex items-center ${collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-1.5'} rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  const actionCls = `flex items-center ${collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'} w-full rounded-lg text-sm font-medium transition-colors`

  return (
    <>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} />}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 overflow-y-auto flex flex-col
        transition-all duration-200
        md:relative md:translate-x-0 md:z-auto
        ${collapsed ? 'w-14' : 'w-56'}
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className={`py-5 border-b border-gray-100 dark:border-gray-800 flex items-center shrink-0 ${collapsed ? 'justify-center px-0' : 'px-5 gap-2.5'}`}>
          <Wallet className="w-5 h-5 text-gray-800 dark:text-white shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="font-bold text-lg text-gray-800 dark:text-white">Caulky</span>}
        </div>

        {/* Nav links */}
        <nav className={`pt-4 space-y-0.5 flex-1 ${collapsed ? 'px-1' : 'px-3'}`}>
          {visibleLinks.map(({ to, labelKey, label, Icon }) => {
            const displayLabel = t(labelKey) || label
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={collapsed ? displayLabel : undefined}
                className={({ isActive }) => linkCls(isActive)}
                onClick={onClose}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                {!collapsed && displayLabel}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer actions */}
        <div className={`pb-4 border-t border-gray-100 dark:border-gray-800 mt-2 pt-2 space-y-0.5 shrink-0 ${collapsed ? 'px-1' : 'px-3'}`}>
          <NavLink
            to="/settings"
            title={collapsed ? t('layout.settings') : undefined}
            className={({ isActive }) => linkCls(isActive)}
            onClick={onClose}
          >
            <Settings className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {!collapsed && t('layout.settings')}
          </NavLink>
          {/* Calculadora — solo fuera de Configuración */}
          {!inSettings && (
            <button
              onClick={() => { setShowCalc(true); onClose?.() }}
              title={collapsed ? 'Calculadora' : undefined}
              className={`${actionCls} text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300`}
            >
              <Calculator className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && 'Calculadora'}
            </button>
          )}
          {/* Acerca de — solo en Configuración */}
          {inSettings && (
            <button
              onClick={() => { setShowInfo(true); onClose?.() }}
              title={collapsed ? t('layout.about') : undefined}
              className={`${actionCls} text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300`}
            >
              <Info className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              {!collapsed && t('layout.about')}
            </button>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? t('layout.logout') : undefined}
            className={`${actionCls} text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400`}
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {!collapsed && t('layout.logout')}
          </button>

          {/* Collapse toggle — desktop only */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              className={`${actionCls} text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-500 dark:hover:text-gray-400 hidden md:flex`}
            >
              {collapsed
                ? <ChevronRight className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                : <ChevronLeft className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              }
              {!collapsed && <span className="text-xs">{t('layout.collapse') || 'Colapsar'}</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
