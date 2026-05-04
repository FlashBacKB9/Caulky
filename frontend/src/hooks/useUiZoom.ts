import { useEffect, useState } from 'react'

const ZOOM_KEY = 'ui-zoom'
const ZOOM_MIN = 80
const ZOOM_MAX = 150
const ZOOM_STEP = 10

export function useUiZoom() {
  const [zoom, setZoomState] = useState<number>(() => {
    const s = localStorage.getItem(ZOOM_KEY)
    return s ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseInt(s, 10))) : 100
  })

  useEffect(() => {
    document.documentElement.style.zoom = zoom + '%'
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  const setZoom = (v: number) => setZoomState(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v)))
  const inc = () => setZoom(zoom + ZOOM_STEP)
  const dec = () => setZoom(zoom - ZOOM_STEP)
  const reset = () => setZoom(100)

  return { zoom, inc, dec, reset, min: ZOOM_MIN, max: ZOOM_MAX }
}
