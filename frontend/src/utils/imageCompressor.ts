function _compress(file: File, maxPx: number, quality: number): Promise<File> {
  if (file.type === 'application/pdf') return Promise.resolve(file)

  return new Promise<File>(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx }
        else        { w = Math.round(w * maxPx / h); h = maxPx }
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return }
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }))
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

/**
 * Compresses a general image for upload.
 * Resizes to max 2048px, quality 0.82.
 * Typical phone photo: 6–12 MB → ~400–800 KB.
 */
export const compressImage = (file: File) => _compress(file, 2048, 0.82)

/**
 * Compresses a ticket image for OCR upload.
 * Uses higher quality (0.95) and larger max size (3000px) to preserve
 * small characters like commas in prices ("1,19" must not become "119").
 */
export const compressTicketImage = (file: File) => _compress(file, 3000, 0.95)
