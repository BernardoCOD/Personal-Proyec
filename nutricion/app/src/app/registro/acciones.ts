'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { calcularEdad, calcularPlan } from '@/lib/calculos'
import { datosUsuario } from '@/lib/datos'
import { esFechaValida, sumarDias } from '@/lib/fechas'

export type EstadoRegistro = { error?: string }

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(80),
  sexo: z.enum(['masculino', 'femenino'], 'Elige el sexo.'),
  fecha_nacimiento: z.string().refine(esFechaValida, 'Fecha de nacimiento no válida.'),
  talla_cm: z.coerce.number().min(100, 'Talla entre 100 y 250 cm.').max(250, 'Talla entre 100 y 250 cm.'),
  peso_kg: z.coerce.number().min(30, 'Peso entre 30 y 300 kg.').max(300, 'Peso entre 30 y 300 kg.'),
  dias_gimnasio: z.coerce.number().int().min(0).max(7),
  tipo_ejercicio: z.array(z.enum(['fuerza', 'cardio', 'mixto', 'deporte', 'ninguno'])),
  nivel_actividad: z.enum(['sedentario', 'ligero', 'moderado', 'muy_activo', 'extremo'], 'Elige tu nivel de actividad.'),
  objetivo: z.enum(['ganar_musculo', 'mantener', 'bajar_grasa'], 'Elige un objetivo.'),
  semanas: z.coerce.number().int().min(0).max(104),
})

export async function guardarRegistro(_: EstadoRegistro, form: FormData): Promise<EstadoRegistro> {
  const r = esquema.safeParse({
    ...Object.fromEntries(form),
    tipo_ejercicio: form.getAll('tipo_ejercicio'),
  })
  if (!r.success) return { error: r.error.issues[0].message }
  const d = r.data

  const { supabase, usuarioId, hoy } = await datosUsuario()
  const edad = calcularEdad(d.fecha_nacimiento, hoy)
  if (edad < 12 || edad > 100) return { error: 'Revisa la fecha de nacimiento.' }

  const plan = calcularPlan(
    { sexo: d.sexo, fechaNacimiento: d.fecha_nacimiento, tallaCm: d.talla_cm, pesoKg: d.peso_kg, nivel: d.nivel_actividad, objetivo: d.objetivo },
    hoy,
  )

  const perfil = await supabase.from('perfiles').update({
    nombre: d.nombre,
    sexo: d.sexo,
    fecha_nacimiento: d.fecha_nacimiento,
    talla_cm: d.talla_cm,
    nivel_actividad: d.nivel_actividad,
    dias_gimnasio: d.dias_gimnasio,
    tipo_ejercicio: d.tipo_ejercicio,
  }).eq('id', usuarioId)
  if (perfil.error) return { error: `No se pudo guardar el perfil: ${perfil.error.message}` }

  const peso = await supabase.from('mediciones_peso')
    .upsert({ usuario_id: usuarioId, fecha: hoy, peso_kg: d.peso_kg }, { onConflict: 'usuario_id,fecha' })
  if (peso.error) return { error: `No se pudo guardar el peso: ${peso.error.message}` }

  // Cierra la etapa anterior y abre la nueva con las metas recalculadas.
  await supabase.from('objetivos').update({ activo: false, fecha_fin: hoy }).eq('activo', true).is('fecha_fin', null)
  await supabase.from('objetivos').update({ activo: false }).eq('activo', true)
  const objetivo = await supabase.from('objetivos').insert({
    usuario_id: usuarioId,
    tipo: d.objetivo,
    fecha_inicio: hoy,
    fecha_fin: d.semanas > 0 ? sumarDias(hoy, d.semanas * 7) : null,
    meta_calorias: plan.metas.calorias,
    meta_proteina_g: plan.metas.proteinaG,
    meta_carbohidratos_g: plan.metas.carbohidratosG,
    meta_grasas_g: plan.metas.grasasG,
  })
  if (objetivo.error) return { error: `No se pudo guardar el objetivo: ${objetivo.error.message}` }

  redirect('/')
}
