import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  autoDisabled: boolean   // true = watchdog killed it at runtime
  code: string
}

export interface PluginScanResult {
  blocked: string[]   // hard errors — plugin will NOT be installed
  warnings: string[]  // soft warnings — plugin installs but with caution
}

// ── Safety scanner ────────────────────────────────────────────────────────────

const BLOCKED_PATTERNS: { re: RegExp; msg: string }[] = [
  { re: /document\.body\.innerHTML\s*=/,          msg: 'Sobreescribe el HTML completo de la app (document.body.innerHTML)' },
  { re: /document\.head\.innerHTML\s*=/,          msg: 'Sobreescribe el head del documento (document.head.innerHTML)' },
  { re: /document\.documentElement\b/,            msg: 'Accede al elemento raíz <html> directamente' },
  { re: /\beval\s*\(/,                            msg: 'Usa eval() — ejecución de código arbitrario' },
  { re: /document\.write\s*\(/,                   msg: 'Usa document.write() — bloquea el renderizado' },
  // Hiding structural layout containers breaks the whole UI
  { re: /\.closest\s*\(\s*['"][^'"]*(?:\.flex|\.flex-col|\.space-y|\.gap-|\.grid)/, msg: 'Usa .closest() con clases de layout (.flex, .grid…) — puede ocultar secciones enteras de la app' },
  // Searching elements by text content and hiding them is too broad
  { re: /\.textContent[\s\S]{0,80}\.includes\s*\([\s\S]{0,200}\.style\.\w+\s*=/, msg: 'Busca elementos por textContent y modifica su estilo — puede romper la UI al afectar contenedores de la app' },
]

const WARN_PATTERNS: { re: RegExp; msg: string }[] = [
  { re: /\.innerHTML\s*=/,                                                        msg: 'Usa innerHTML — asegúrate de apuntar a un elemento concreto' },
  // Match generic selectors anywhere in the string, not just at the start
  { re: /querySelectorAll?\s*\(\s*['"][^'"]*(?:\*|\bdiv\b|\bspan\b|\bbody\b|\bhtml\b|\.flex)/, msg: 'Selector muy genérico — puede afectar a toda la app' },
  { re: /\bsetInterval\s*\(/,                                                     msg: 'Usa setInterval — recuerda limpiarlo en __cleanup()' },
  { re: /history\.pushState|history\.replaceState/,                               msg: 'Modifica el historial — recuerda restaurarlo en __cleanup()' },
  { re: /\.style\.display\s*=\s*['"]none['"]/,                                   msg: 'Oculta elementos con style.display — asegúrate de apuntar a elementos propios del plugin, no de la app' },
  { re: /\.parentElement\s*[;.]/,                                                 msg: 'Accede a parentElement — puede modificar contenedores de la app accidentalmente' },
]

function hasCleanup(code: string) {
  return /function\s+__cleanup\b/.test(code)
}

function modifiesDOM(code: string) {
  return /document\.(createElement|querySelector|getElementById|body|head)\b/.test(code)
}

export function scanPlugin(code: string): PluginScanResult {
  const blocked  = BLOCKED_PATTERNS.filter(p => p.re.test(code)).map(p => p.msg)
  const warnings = WARN_PATTERNS.filter(p => p.re.test(code)).map(p => p.msg)

  if (modifiesDOM(code) && !hasCleanup(code)) {
    warnings.push('No tiene función __cleanup() — los cambios en el DOM no se revertirán al desactivarlo')
  }

  return { blocked, warnings }
}

// ── Storage ───────────────────────────────────────────────────────────────────

import { syncPref } from '../utils/prefSync'

const STORAGE_KEY = 'caulky_plugins'

function loadPlugins(): Plugin[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function savePlugins(plugins: Plugin[]) {
  syncPref(STORAGE_KEY, JSON.stringify(plugins))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(plugins) }))
}

// ── Runtime ───────────────────────────────────────────────────────────────────

const cleanupMap = new Map<string, () => void>()

const MUTATION_LIMIT  = 80    // max DOM mutations during watchdog window
const WATCHDOG_MS     = 2000  // how long to watch after plugin starts

function autoDisablePlugin(id: string, name: string) {
  const updated = loadPlugins().map(p =>
    p.id === id ? { ...p, enabled: false, autoDisabled: true } : p
  )
  savePlugins(updated)
  console.warn(`[Plugin] "${name}" auto-desactivado: provocó demasiadas mutaciones del DOM (>${MUTATION_LIMIT} en ${WATCHDOG_MS / 1000}s).`)
}

function runPlugin(plugin: Plugin) {
  if (cleanupMap.has(plugin.id)) return
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      plugin.code + '\nreturn typeof __cleanup__ !== "undefined" ? __cleanup__ : (typeof __cleanup === "function" ? __cleanup : null);'
    )
    const cleanup    = fn()
    const userCleanup: () => void = typeof cleanup === 'function' ? cleanup : () => {}

    // ── Mutation watchdog ─────────────────────────────────────────────────
    let mutCount = 0
    let stopped  = false

    const watchdog = new MutationObserver(() => {
      mutCount++
      if (!stopped && mutCount > MUTATION_LIMIT) {
        stopped = true
        watchdog.disconnect()
        try { userCleanup() } catch {}
        cleanupMap.delete(plugin.id)
        autoDisablePlugin(plugin.id, plugin.name)
      }
    })

    watchdog.observe(document.body, { childList: true, subtree: true, attributes: true })
    const timer = setTimeout(() => { stopped = true; watchdog.disconnect() }, WATCHDOG_MS)

    cleanupMap.set(plugin.id, () => {
      clearTimeout(timer)
      watchdog.disconnect()
      userCleanup()
    })
  } catch (err) {
    console.error(`[Plugin] "${plugin.name}" error al ejecutar:`, err)
  }
}

function stopPlugin(id: string) {
  const cleanup = cleanupMap.get(id)
  if (cleanup) {
    try { cleanup() } catch {}
    cleanupMap.delete(id)
  }
}

// ── ID helper ─────────────────────────────────────────────────────────────────

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ── Public hooks ──────────────────────────────────────────────────────────────

export function applyAllEnabled() {
  loadPlugins().filter(p => p.enabled).forEach(runPlugin)
}

export function usePluginLoader() {
  useEffect(() => { applyAllEnabled() }, [])
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>(loadPlugins)

  // Stay in sync when watchdog auto-disables a plugin from outside React
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setPlugins(JSON.parse(e.newValue)) } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const persist = useCallback((next: Plugin[]) => {
    setPlugins(next)
    savePlugins(next)
  }, [])

  const addPlugin = useCallback(async (file: File): Promise<PluginScanResult> => {
    const code = await file.text()
    const scan = scanPlugin(code)

    if (scan.blocked.length > 0) return scan   // blocked — caller shows error

    const plugin: Plugin = {
      id: uid(),
      ...parseMetadata(code),
      enabled: true,
      autoDisabled: false,
      code,
    }
    runPlugin(plugin)
    persist([...plugins, plugin])
    return scan   // may still have warnings
  }, [plugins, persist])

  const removePlugin = useCallback((id: string) => {
    stopPlugin(id)
    persist(plugins.filter(p => p.id !== id))
  }, [plugins, persist])

  const togglePlugin = useCallback((id: string) => {
    persist(plugins.map(p => {
      if (p.id !== id) return p
      if (p.enabled) {
        stopPlugin(id)
        return { ...p, enabled: false, autoDisabled: false }
      }
      runPlugin(p)
      return { ...p, enabled: true, autoDisabled: false }
    }))
  }, [plugins, persist])

  const removeAll = useCallback(() => {
    plugins.forEach(p => stopPlugin(p.id))
    persist([])
  }, [plugins, persist])

  return { plugins, addPlugin, removePlugin, togglePlugin, removeAll }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function parseMetadata(code: string): Pick<Plugin, 'name' | 'description' | 'version'> {
  const get = (tag: string) => code.match(new RegExp(`@${tag}[ \t]+(.+)`))?.[1]?.trim() ?? ''
  return {
    name:        get('name')        || 'Plugin sin nombre',
    description: get('description') || '',
    version:     get('version')     || '1.0',
  }
}
