/**
 * Ticket category configuration — shared between Tickets page and Settings.
 * Manages built-in defaults, user overrides, custom categories, and visibility.
 */
import type { ComponentType, CSSProperties } from 'react'
import {
  Droplets, GlassWater, Popcorn, Wheat, Candy, Baby, Wine, Coffee, Beef, Cookie, Sandwich,
  Snowflake, Archive, Scissors, Sparkles, Pill, Apple, Milk, Home, Palette, Fish, PawPrint,
  CakeSlice, Pizza, IceCreamCone, Tag, Citrus, Leaf, Package, ShoppingCart, Upload, Receipt,
} from 'lucide-react'
import { syncPref } from './prefSync'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CatIcon = ComponentType<{ className?: string; style?: CSSProperties }>
export type CatCfgType = { icon: CatIcon; color: string }

export interface CategoryInfo {
  name: string
  iconName: string
  color: string
  hidden: boolean
  isBuiltin: boolean
}

// ── Built-in defaults ─────────────────────────────────────────────────────────

export const BUILTIN_CATS: Record<string, { iconName: string; color: string }> = {
  'Aceites especias y salsas':    { iconName: 'Droplets',     color: '#d97706' },
  'Agua y refrescos':             { iconName: 'GlassWater',   color: '#3b82f6' },
  'Aperitivos':                   { iconName: 'Popcorn',      color: '#f97316' },
  'Arroz legumbres y pasta':      { iconName: 'Wheat',        color: '#ca8a04' },
  'Azúcar caramelos y chocolate': { iconName: 'Candy',        color: '#7c3aed' },
  'Bebé':                         { iconName: 'Baby',         color: '#ec4899' },
  'Bodega':                       { iconName: 'Wine',         color: '#b91c1c' },
  'Cacao café e infusiones':      { iconName: 'Coffee',       color: '#92400e' },
  'Carne':                        { iconName: 'Beef',         color: '#ef4444' },
  'Cereales y galletas':          { iconName: 'Cookie',       color: '#b45309' },
  'Charcutería y quesos':         { iconName: 'Sandwich',     color: '#f59e0b' },
  'Congelados':                   { iconName: 'Snowflake',    color: '#0891b2' },
  'Conservas caldos y cremas':    { iconName: 'Archive',      color: '#65a30d' },
  'Cuidado del cabello':          { iconName: 'Scissors',     color: '#9333ea' },
  'Cuidado facial y corporal':    { iconName: 'Sparkles',     color: '#db2777' },
  'Fitoterapia y parafarmacia':   { iconName: 'Pill',         color: '#059669' },
  'Fruta y verdura':              { iconName: 'Apple',        color: '#16a34a' },
  'Huevos leche y mantequilla':   { iconName: 'Milk',         color: '#eab308' },
  'Limpieza y hogar':             { iconName: 'Home',         color: '#4f46e5' },
  'Maquillaje':                   { iconName: 'Palette',      color: '#e11d48' },
  'Marisco y pescado':            { iconName: 'Fish',         color: '#0284c7' },
  'Mascotas':                     { iconName: 'PawPrint',     color: '#ea580c' },
  'Panadería y pastelería':       { iconName: 'CakeSlice',    color: '#c2410c' },
  'Pizzas y platos preparados':   { iconName: 'Pizza',        color: '#dc2626' },
  'Postres y yogures':            { iconName: 'IceCreamCone', color: '#c026d3' },
  'Sin categoría':                { iconName: 'Tag',          color: '#6b7280' },
  'Zumos':                        { iconName: 'Citrus',       color: '#ea580c' },
}

// ── Icon registry ─────────────────────────────────────────────────────────────

export const ICON_NAME_MAP: Record<string, CatIcon> = {
  Droplets, GlassWater, Popcorn, Wheat, Candy, Baby, Wine, Coffee, Beef, Cookie, Sandwich,
  Snowflake, Archive, Scissors, Sparkles, Pill, Apple, Milk, Home, Palette, Fish, PawPrint,
  CakeSlice, Pizza, IceCreamCone, Tag, Citrus, Leaf, Package, ShoppingCart, Upload, Receipt,
}

export const PRESET_ICONS: { name: string; Icon: CatIcon }[] = [
  { name: 'Apple',        Icon: Apple        },
  { name: 'Fish',         Icon: Fish         },
  { name: 'Beef',         Icon: Beef         },
  { name: 'Milk',         Icon: Milk         },
  { name: 'Coffee',       Icon: Coffee       },
  { name: 'Cookie',       Icon: Cookie       },
  { name: 'Pizza',        Icon: Pizza        },
  { name: 'Candy',        Icon: Candy        },
  { name: 'Wine',         Icon: Wine         },
  { name: 'GlassWater',   Icon: GlassWater   },
  { name: 'Snowflake',    Icon: Snowflake    },
  { name: 'Pill',         Icon: Pill         },
  { name: 'PawPrint',     Icon: PawPrint     },
  { name: 'Scissors',     Icon: Scissors     },
  { name: 'Palette',      Icon: Palette      },
  { name: 'Sparkles',     Icon: Sparkles     },
  { name: 'Home',         Icon: Home         },
  { name: 'Package',      Icon: Package      },
  { name: 'ShoppingCart', Icon: ShoppingCart },
  { name: 'Leaf',         Icon: Leaf         },
  { name: 'Wheat',        Icon: Wheat        },
  { name: 'Archive',      Icon: Archive      },
  { name: 'Sandwich',     Icon: Sandwich     },
  { name: 'IceCreamCone', Icon: IceCreamCone },
  { name: 'Tag',          Icon: Tag          },
  { name: 'Citrus',       Icon: Citrus       },
  { name: 'Droplets',     Icon: Droplets     },
  { name: 'Baby',         Icon: Baby         },
  { name: 'CakeSlice',    Icon: CakeSlice    },
  { name: 'Popcorn',      Icon: Popcorn      },
  { name: 'Receipt',      Icon: Receipt      },
  { name: 'Upload',       Icon: Upload       },
]

export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
  '#0891b2', '#b91c1c', '#92400e', '#166534',
]

// ── Persistent store ──────────────────────────────────────────────────────────

export const CAT_STORE_KEY = 'ticket-categories-v1'

interface CatStoreEntry {
  iconName: string
  color: string
  hidden?: boolean
}

function loadStore(): Record<string, CatStoreEntry> {
  try {
    const v1 = localStorage.getItem(CAT_STORE_KEY)
    if (v1) return JSON.parse(v1)
    // Migrate from old caulky_cat_cfg (custom categories)
    const legacy = localStorage.getItem('caulky_cat_cfg')
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, { iconName?: string; color: string }>
      const migrated: Record<string, CatStoreEntry> = {}
      for (const [name, cfg] of Object.entries(parsed)) {
        if (cfg.iconName) migrated[name] = { iconName: cfg.iconName, color: cfg.color }
      }
      return migrated
    }
  } catch {}
  return {}
}

let _store: Record<string, CatStoreEntry> = loadStore()

function saveStore() {
  try { localStorage.setItem(CAT_STORE_KEY, JSON.stringify(_store)) } catch {}
  syncPref(CAT_STORE_KEY, JSON.stringify(_store))
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get display config (icon + color) for a category name. */
export function catCfg(cat: string): CatCfgType {
  const override = _store[cat]
  if (override && !override.hidden) {
    return { icon: ICON_NAME_MAP[override.iconName] ?? Tag, color: override.color }
  }
  const builtin = BUILTIN_CATS[cat]
  if (builtin) {
    return { icon: ICON_NAME_MAP[builtin.iconName] ?? Tag, color: builtin.color }
  }
  return { icon: Tag, color: '#6b7280' }
}

/** All visible category names (for use in pickers). */
export function getVisibleCategories(): string[] {
  const builtIn = Object.keys(BUILTIN_CATS).filter(cat => !_store[cat]?.hidden)
  const custom = Object.keys(_store).filter(cat => !_store[cat].hidden && !BUILTIN_CATS[cat])
  return [...new Set([...builtIn, ...custom])].sort()
}

/** Full info for each category — for Settings UI. */
export function getAllCategoryInfo(): CategoryInfo[] {
  const result: CategoryInfo[] = []
  for (const name of Object.keys(BUILTIN_CATS)) {
    const s = _store[name]
    result.push({
      name,
      iconName: s?.iconName ?? BUILTIN_CATS[name].iconName,
      color:    s?.color    ?? BUILTIN_CATS[name].color,
      hidden: !!s?.hidden,
      isBuiltin: true,
    })
  }
  for (const [name, entry] of Object.entries(_store)) {
    if (!BUILTIN_CATS[name]) {
      result.push({ name, iconName: entry.iconName, color: entry.color, hidden: !!entry.hidden, isBuiltin: false })
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/** Save icon + color for a category (built-in override or custom). */
export function setCatConfig(name: string, iconName: string, color: string) {
  _store[name] = { ...(_store[name] ?? {}), iconName, color, hidden: false }
  saveStore()
}

/** Show or hide a category from the picker. */
export function setCatHidden(name: string, hidden: boolean) {
  const fallback = BUILTIN_CATS[name]
    ? { iconName: BUILTIN_CATS[name].iconName, color: BUILTIN_CATS[name].color }
    : { iconName: 'Tag', color: '#6b7280' }
  _store[name] = { ...(_store[name] ?? fallback), hidden }
  saveStore()
}

/** Permanently delete a custom category. */
export function deleteCat(name: string) {
  delete _store[name]
  saveStore()
}

/** Add or update a custom category. */
export function addCustomCat(name: string, iconName: string, color: string) {
  _store[name] = { iconName, color }
  saveStore()
}

/** Reset a built-in category back to its defaults. */
export function resetCat(name: string) {
  delete _store[name]
  saveStore()
}

/** Backward-compat alias used by CategoryPicker. */
export const registerCustomCat = addCustomCat
