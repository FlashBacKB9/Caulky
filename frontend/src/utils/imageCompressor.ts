/**
 * Compresses an image File to JPEG before uploading.
 * PDFs are returned unchanged.
 * Resizes to max 2048px on the longest side and encodes at 0.82 quality.
 * Typical phone photo: 6–12 MB → ~400–800 KB.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file

  return new Promise<File>(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 2048
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX }
        else        { w = Math.round(w * MAX / h); h = MAX }
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
        0.82,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
