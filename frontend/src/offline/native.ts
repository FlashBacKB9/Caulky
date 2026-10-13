import { registerPlugin } from '@capacitor/core'

/** Plugin propio de la APK (CaulkyNativePlugin.java). */
interface CaulkyNativePlugin {
  /** Color de la franja de la barra de estado y de la de navegación. */
  setBarColor(options: { color: string }): Promise<void>
  /** Ids de los widgets de presupuestos que hay en el escritorio. */
  listWidgets(): Promise<{ budgets: number[] }>
  /** Guarda los datos (JSON) de los widgets del escritorio y los repinta. */
  updateWidgets(options: { data: string }): Promise<void>
}

export const CaulkyNative = registerPlugin<CaulkyNativePlugin>('CaulkyNative')
