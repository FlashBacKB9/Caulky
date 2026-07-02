import { useRef, useState } from 'react'
import { Sun, Moon, Download, Upload, Palette, Trash2 } from 'lucide-react'
import { useDarkMode } from '../../hooks/useDarkMode'
import { useCurrency } from '../../hooks/useCurrency'
import { useDateFormat, DATE_FORMATS } from '../../hooks/useDateFormat'
import { useUiZoom } from '../../hooks/useUiZoom'
import {
  t, BUILT_IN_LANGS, getLanguage, setLanguage,
  loadCustomLanguages, saveCustomLanguages, parseLanguageFile, type CustomLanguage,
} from '../../utils/i18n'
import { loadSkins, saveSkins, applySkinCSS, parseSkinFile, type Skin } from '../../utils/skins'
import { Section } from './shared'

// ── Language section ──────────────────────────────────────────────────────────

function LanguageSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [activeLang, setActiveLang] = useState(getLanguage)
  const [customLangs, setCustomLangs] = useState<CustomLanguage[]>(loadCustomLanguages)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const persistCustom = (next: CustomLanguage[]) => {
    setCustomLangs(next)
    saveCustomLanguages(next)
  }

  const handleSelect = (id: string) => {
    setActiveLang(id)
    setLanguage(id)
  }

  const removeCustom = (id: string) => {
    const wasActive = activeLang === id
    persistCustom(customLangs.filter(l => l.id !== id))
    if (wasActive) setLanguage('es')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true); setError(null)
    try {
      const meta = await parseLanguageFile(file)
      const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      persistCustom([...customLangs, { ...meta, id }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el idioma')
    } finally { setLoading(false) }
  }

  const btnCls = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      active
        ? 'bg-blue-500 border-blue-500 text-white'
        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
    }`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUILT_IN_LANGS.map(lang => (
          <button key={lang.id} onClick={() => handleSelect(lang.id)} className={btnCls(activeLang === lang.id)}>
            <span>{lang.flag}</span>
            <span>{lang.name}</span>
          </button>
        ))}
        {customLangs.map(lang => (
          <div key={lang.id} className="flex items-center gap-0.5">
            <button onClick={() => handleSelect(lang.id)} className={btnCls(activeLang === lang.id)}>
              {lang.flag && <span>{lang.flag}</span>}
              <span>{lang.name}</span>
            </button>
            <button onClick={() => removeCustom(lang.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-40"
        >
          <Upload className="w-4 h-4" />
          {loading ? t('common.loading') : t('settings.languageInstall')}
        </button>
        <a
          href="/locales/example-translation.js"
          download="example-translation.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/locales/lang-dev-guide.md"
          download="lang-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>
    </div>
  )
}

// ── Skins section ─────────────────────────────────────────────────────────────

function SkinsSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [skins, setSkins] = useState<Skin[]>(loadSkins)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const persist = (next: Skin[]) => {
    setSkins(next)
    saveSkins(next)
  }

  const toggle = (id: string) => {
    // Only one skin active at a time; toggling active skin deactivates it
    const next = skins.map(s => ({ ...s, enabled: s.id === id ? !s.enabled : false }))
    persist(next)
    const active = next.find(s => s.enabled)
    applySkinCSS(active?.css)
    window.location.reload()
  }

  const remove = (id: string) => {
    const wasActive = skins.find(s => s.id === id)?.enabled
    const next = skins.filter(s => s.id !== id)
    persist(next)
    if (wasActive) { applySkinCSS(undefined); window.location.reload() }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true); setError(null)
    try {
      const meta = await parseSkinFile(file)
      const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const newSkin: Skin = { ...meta, id, enabled: false }
      persist([...skins, newSkin])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.skinsLoadError'))
    } finally { setLoading(false) }
  }

  const LAYOUT_LABEL: Record<string, string> = { topnav: t('settings.skinsTopNav'), sidebar: t('settings.skinsSidebar') }

  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
        {skins.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{t('settings.skinsNone')}</p>
        )}
        {skins.map(skin => (
          <div key={skin.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center shrink-0">
              <Palette className="w-3.5 h-3.5 text-pink-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{skin.name}</p>
                {skin.layout && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {LAYOUT_LABEL[skin.layout] ?? skin.layout}
                  </span>
                )}
              </div>
              {skin.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{skin.description}</p>
              )}
              {skin.author && (
                <p className="text-xs text-gray-300 dark:text-gray-600">{t('settings.skinsBy')} {skin.author}</p>
              )}
            </div>
            <button
              onClick={() => toggle(skin.id)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                skin.enabled ? 'bg-pink-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                skin.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <button onClick={() => remove(skin.id)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 rounded transition-colors shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <input ref={fileRef} type="file" accept=".js" onChange={handleFile} className="sr-only" />
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-40"
        >
          <Upload className="w-4 h-4" />
          {loading ? t('common.loading') : t('settings.skinsInstall')}
        </button>
        <a
          href="/skins/cute-pastel.js"
          download="cute-pastel.js"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageExample')}
        </a>
        <a
          href="/skins/skin-dev-guide.md"
          download="skin-dev-guide.md"
          className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          {t('settings.languageGuide')}
        </a>
      </div>
    </div>
  )
}

// ── Tab entry point ────────────────────────────────────────────────────────────

export default function AparienciaTab() {
  const { dark, toggle } = useDarkMode()
  const { currency, setCurrency, currencies } = useCurrency()
  const { format: dateFormat, setFormat: setDateFormat } = useDateFormat()
  const { zoom, setZoom, inc: zoomIn, dec: zoomOut, min: zoomMin, max: zoomMax } = useUiZoom()

  return (
    <>
      <Section title={t('settings.appearance')}>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.theme')}</span>
            <button
              onClick={toggle}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {dark ? <Sun className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {dark ? t('settings.lightMode') : t('settings.darkMode')}
            </button>
          </div>
          <div className="px-4 py-3">
            <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.currency')}</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {currencies.map(c => (
                <button
                  key={c.code} onClick={() => setCurrency(c.code)} title={c.label}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    currency === c.code
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
                  }`}
                >
                  {c.symbol} {c.code}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.dateFormat')}</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {DATE_FORMATS.map(f => (
                <button
                  key={f.value} onClick={() => setDateFormat(f.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border font-mono transition-colors ${
                    dateFormat === f.value
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-gray-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden md:flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700 dark:text-gray-200">{t('settings.uiSize')}</span>
            <div className="flex items-center gap-2">
              <button onClick={zoomOut} disabled={zoom <= zoomMin}
                className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-base font-medium flex items-center justify-center transition-colors">−</button>
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
                <input
                  type="number" min={zoomMin} max={zoomMax} value={zoom}
                  onChange={e => setZoom(parseInt(e.target.value) || zoom)}
                  onBlur={e => setZoom(parseInt(e.target.value) || zoom)}
                  className="w-10 text-center text-xs font-mono font-medium text-gray-700 dark:text-gray-200 bg-transparent focus:outline-none py-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500 pr-1.5">%</span>
              </div>
              <button onClick={zoomIn} disabled={zoom >= zoomMax}
                className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 text-base font-medium flex items-center justify-center transition-colors">+</button>
            </div>
          </div>
        </div>
      </Section>
      <Section title={t('settings.language')}>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.languageDesc')}</p>
        <LanguageSection />
      </Section>
      <Section title={t('settings.skins')}>
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">{t('settings.skinsDesc')}</p>
        <SkinsSection />
      </Section>
    </>
  )
}
