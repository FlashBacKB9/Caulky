import { useEffect, useState } from 'react'

const ZOOM_KEY  = 'ui-zoom-v2'   // v2: 100 display → 120% actual
const ZOOM_MIN  = 70
const ZOOM_MAX  = 130
const ZOOM_STEP = 10
const ZOOM_SCALE = 1.2            // multiply display value to get actual CSS zoom

export function useUiZoom() {
  const [zoom, setZoomState] = useState<number>(() => {
    const s = localStorage.getItem(ZOOM_KEY)
    return s ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseInt(s, 10))) : 100
  })

  useEffect(() => {
    const actual = zoom * ZOOM_SCALE
    document.documentElement.style.zoom = actual + '%'
    document.documentElement.style.minHeight = actual < 100 ? `${(100 * 100 / actual).toFixed(2)}%` : ''
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  const setZoom = (v: number) => setZoomState(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(v))))
  const inc   = () => setZoom(zoom + ZOOM_STEP)
  const dec   = () => setZoom(zoom - ZOOM_STEP)
  const reset = () => setZoom(100)

  return { zoom, setZoom, inc, dec, reset, min: ZOOM_MIN, max: ZOOM_MAX }
}
