'use client'

/**
 * Prepara una foto para subirla: la gira según la cámara, la reduce a un
 * máximo de 1600 px y la vuelve a guardar como JPEG. Al redibujarla se
 * pierden los datos ocultos (ubicación GPS, modelo del teléfono, etc.).
 */
export async function prepararFoto(archivo: File, ladoMaximo = 1600): Promise<Blob> {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('Este navegador no puede procesar la imagen.')
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  return new Promise((resolver, fallar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : fallar(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85),
  )
}
