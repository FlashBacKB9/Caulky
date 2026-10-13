import { useSyncExternalStore, type ReactNode } from 'react'
import { CloudOff } from 'lucide-react'
import { isOnline, subscribe } from './connectivity'
import { closeFloating } from './floating'

/** Tarjeta de speedmode flotante (APK, abierto desde el widget) sobre fondo atenuado. */
export function FloatingShell({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(subscribe, isOnline)
  return (
    // Centrada en la pantalla, como un diálogo
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" onClick={closeFloating}>
      <div
        className="w-full max-w-md h-full max-h-[760px] flex flex-col rounded-3xl overflow-hidden shadow-2xl bg-white dark:bg-gray-950"
        onClick={e => e.stopPropagation()}
      >
        {!online && (
          <div className="shrink-0 mx-4 mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-100">
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
            Sin conexión: se guarda en el móvil y se sincroniza al volver a abrir Caulky
          </div>
        )}
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )
}
