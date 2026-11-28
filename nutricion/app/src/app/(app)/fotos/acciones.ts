'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { datosUsuario } from '@/lib/datos'
import { esFechaValida } from '@/lib/fechas'
import { BUCKET_FOTOS } from '@/lib/fotos'

const esquema = z.object({
  ruta: z.string().max(200),
  fecha: z.string().refine(esFechaValida, 'Fecha no válida.'),
  vista: z.enum(['frente', 'perfil', 'espalda']),
  notas: z.string().trim().max(300).optional(),
})

/** Registra una foto ya subida al almacenamiento (en la carpeta del usuario). */
export async function guardarFoto(datos: unknown): Promise<{ error?: string }> {
  const r = esquema.safeParse(datos)
  if (!r.success) return { error: r.error.issues[0].message }
  const { supabase, usuarioId, hoy } = await datosUsuario()
  const d = r.data
  if (!new RegExp(`^${usuarioId}/[0-9a-f-]{36}\\.jpg$`).test(d.ruta)) return { error: 'Ruta de foto no válida.' }
  if (d.fecha > hoy) return { error: 'La fecha no puede ser futura.' }

  // Peso de ese día (o el último anterior), para ver el cambio al comparar.
  const { data: peso } = await supabase.from('mediciones_peso').select('peso_kg')
    .lte('fecha', d.fecha).order('fecha', { ascending: false }).limit(1).maybeSingle()

  const { error } = await supabase.from('fotos_progreso').insert({
    usuario_id: usuarioId, ruta: d.ruta, fecha: d.fecha, vista: d.vista, notas: d.notas || null,
    peso_kg: peso ? Number(peso.peso_kg) : null,
  })
  if (error) {
    await supabase.storage.from(BUCKET_FOTOS).remove([d.ruta])
    return { error: `No se pudo guardar la foto: ${error.message}` }
  }
  revalidatePath('/fotos')
  return {}
}

/** Borra la foto (archivo y registro). */
export async function eliminarFoto(id: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(id).success) return { error: 'Foto no válida.' }
  const { supabase } = await datosUsuario()
  const { data: foto } = await supabase.from('fotos_progreso').select('ruta').eq('id', id).maybeSingle()
  if (!foto) return { error: 'Esa foto ya no existe.' }
  const archivo = await supabase.storage.from(BUCKET_FOTOS).remove([foto.ruta])
  if (archivo.error) return { error: `No se pudo borrar el archivo: ${archivo.error.message}` }
  await supabase.from('fotos_progreso').delete().eq('id', id)
  revalidatePath('/fotos')
  return {}
}
