import { useEffect, useState } from 'react'
import api from '../api/client'
import { isNative } from './platform'

/**
 * `src` para una imagen o PDF servido por la API. En la web es la URL de siempre; en la
 * APK la cookie de sesión no viaja en un <img> hacia otro origen, así que se descarga por
 * la API y se usa una URL local.
 */
export function useApiSrc(path: string | null, mime?: string): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>()

  useEffect(() => {
    if (!isNative || !path) return
    let url = ''
    let alive = true
    api.get(path, { responseType: 'blob' })
      .then(res => {
        if (!alive) return
        url = URL.createObjectURL(mime ? new Blob([res.data], { type: mime }) : res.data)
        setBlobUrl(url)
      })
      .catch(() => { /* sin conexión: no hay imagen */ })
    return () => { alive = false; if (url) URL.revokeObjectURL(url); setBlobUrl(undefined) }
  }, [path, mime])

  if (!path) return undefined
  return isNative ? blobUrl : `/api${path}`
}
