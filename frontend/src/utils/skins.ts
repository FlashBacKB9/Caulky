import { syncPref } from './prefSync'

export interface Skin {
  id: string
  name: string
  author?: string
  version?: string
  description?: string
  layout?: 'sidebar' | 'topnav'
  css?: string
  enabled: boolean
  source: string
}

const STORAGE_KEY = 'app-skins'

export function loadSkins(): Skin[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

export function saveSkins(skins: Skin[]): void {
  syncPref(STORAGE_KEY, JSON.stringify(skins))
}

export function getActiveSkin(): Skin | null {
  return loadSkins().find(s => s.enabled) ?? null
}

export function applySkinCSS(css: string | undefined): void {
  let el = document.getElementById('active-skin-css') as HTMLStyleElement | null
  if (!css) {
    if (el) el.textContent = ''
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = 'active-skin-css'
    document.head.appendChild(el)
  }
  el.textContent = css
}

export async function parseSkinFile(file: File): Promise<Omit<Skin, 'id' | 'enabled'>> {
  const source = await file.text()
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const mod = await import(/* @vite-ignore */ url)
    const def = mod.default
    if (!def || typeof def !== 'object') throw new Error('El archivo no exporta un objeto por defecto válido')
    if (typeof def.name !== 'string' || !def.name.trim()) throw new Error('El skin necesita un campo "name"')
    return {
      name: def.name,
      author: def.author,
      version: def.version,
      description: def.description,
      layout: def.layout,
      css: def.css,
      source,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
