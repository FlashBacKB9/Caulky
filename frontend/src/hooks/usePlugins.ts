import { useState, useEffect, useCallback } from 'react'

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  code: string
}

const STORAGE_KEY = 'caulky_plugins'
const cleanupMap = new Map<string, () => void>()

function parseMetadata(code: string): Pick<Plugin, 'name' | 'description' | 'version'> {
  const get = (tag: string) => code.match(new RegExp(`@${tag}[ \t]+(.+)`))?.[1]?.trim() ?? ''
  return {
    name:        get('name')        || 'Plugin sin nombre',
    description: get('description') || '',
    version:     get('version')     || '1.0',
  }
}

function runPlugin(plugin: Plugin) {
  if (cleanupMap.has(plugin.id)) return
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      plugin.code + '\nreturn typeof __cleanup__ !== "undefined" ? __cleanup__ : null;'
    )
    const cleanup = fn()
    cleanupMap.set(plugin.id, typeof cleanup === 'function' ? cleanup : () => {})
  } catch (err) {
    console.error(`[Plugin] "${plugin.name}" error:`, err)
  }
}

function stopPlugin(id: string) {
  const cleanup = cleanupMap.get(id)
  if (cleanup) {
    try { cleanup() } catch {}
    cleanupMap.delete(id)
  }
}

function loadPlugins(): Plugin[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function savePlugins(plugins: Plugin[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins))
}

export function applyAllEnabled() {
  loadPlugins().filter(p => p.enabled).forEach(runPlugin)
}

export function usePluginLoader() {
  useEffect(() => { applyAllEnabled() }, [])
}

export function usePlugins() {
  const [plugins, setPlugins] = useState<Plugin[]>(loadPlugins)

  const persist = useCallback((next: Plugin[]) => {
    setPlugins(next)
    savePlugins(next)
  }, [])

  const addPlugin = useCallback(async (file: File) => {
    const code = await file.text()
    const plugin: Plugin = {
      id: crypto.randomUUID(),
      ...parseMetadata(code),
      enabled: true,
      code,
    }
    runPlugin(plugin)
    persist([...plugins, plugin])
  }, [plugins, persist])

  const removePlugin = useCallback((id: string) => {
    stopPlugin(id)
    persist(plugins.filter(p => p.id !== id))
  }, [plugins, persist])

  const togglePlugin = useCallback((id: string) => {
    persist(plugins.map(p => {
      if (p.id !== id) return p
      if (p.enabled) { stopPlugin(id); return { ...p, enabled: false } }
      runPlugin(p); return { ...p, enabled: true }
    }))
  }, [plugins, persist])

  return { plugins, addPlugin, removePlugin, togglePlugin }
}
