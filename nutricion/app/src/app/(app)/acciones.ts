'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { datosUsuario } from '@/lib/datos'
import { esFechaValida, fechaEnZona } from '@/lib/fechas'
import { aGramos, macrosDeGramos, por100gDeTotales, redondear, type Porcion, type ValoresPor100g } from '@/lib/unidades'

const uuid = z.uuid()

// ---------------------------------------------------------------------
// Borrar
// ---------------------------------------------------------------------
export async function eliminarItem(form: FormData) {
  const id = uuid.parse(form.get('id'))
  const { supabase } = await datosUsuario()
  const { data } = await supabase.from('comida_items').delete().eq('id', id).select('comida_id').maybeSingle()
  if (data) {
    // Si la comida quedó vacía, se borra también.
    const { count } = await supabase.from('comida_items').select('id', { count: 'exact', head: true }).eq('comida_id', data.comida_id)
    if (count === 0) await supabase.from('comidas').delete().eq('id', data.comida_id)
  }
  revalidatePath('/', 'layout')
  // Desde la pantalla de edición se vuelve al día del alimento.
  const volver = String(form.get('volver') ?? '')
  if (/^\/\?fecha=\d{4}-\d{2}-\d{2}$/.test(volver)) redirect(volver)
}

export async function eliminarComida(form: FormData) {
  const id = uuid.parse(form.get('id'))
  const { supabase } = await datosUsuario()
  await supabase.from('comidas').delete().eq('id', id)
  revalidatePath('/', 'layout')
}

export async function eliminarActividad(form: FormData) {
  const id = uuid.parse(form.get('id'))
  const { supabase } = await datosUsuario()
  await supabase.from('actividades').delete().eq('id', id)
  revalidatePath('/', 'layout')
}

// ---------------------------------------------------------------------
// Buscar alimentos
// ---------------------------------------------------------------------
export type AlimentoBuscado = ValoresPor100g & {
  id: string
  nombre: string
  marca: string | null
  fuente: string
  porciones: Porcion[]
}

const COLUMNAS_ALIMENTO = 'id, nombre, marca, fuente, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, porciones(nombre, gramos)'

export async function buscarAlimentos(texto: string): Promise<AlimentoBuscado[]> {
  const q = String(texto ?? '').trim().slice(0, 60)
  if (q.length < 2) return []
  const { supabase } = await datosUsuario()
  // Sin tildes, varias palabras y ordenado por relevancia (ver migración de búsqueda).
  const { data, error } = await supabase.rpc('buscar_alimentos', { texto: q, limite: 25 })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(normalizarAlimento)
}

/** Alimentos que más usé últimamente, para registrarlos con un toque. */
export async function alimentosRecientes(): Promise<AlimentoBuscado[]> {
  const { supabase } = await datosUsuario()
  const { data } = await supabase.from('comida_items').select('alimento_id')
    .not('alimento_id', 'is', null).order('created_at', { ascending: false }).limit(60)
  const ids = [...new Set((data ?? []).map((r) => r.alimento_id as string))].slice(0, 12)
  if (ids.length === 0) return []
  const r = await supabase.from('alimentos').select(COLUMNAS_ALIMENTO).in('id', ids)
  const porId = new Map((r.data ?? []).map((a) => [a.id as string, normalizarAlimento(a)]))
  return ids.map((id) => porId.get(id)).filter((a): a is AlimentoBuscado => Boolean(a))
}

function normalizarAlimento(a: Record<string, unknown>): AlimentoBuscado {
  return {
    id: a.id as string,
    nombre: a.nombre as string,
    marca: (a.marca as string | null) ?? null,
    fuente: a.fuente as string,
    calorias: Number(a.calorias),
    proteina_g: Number(a.proteina_g),
    carbohidratos_g: Number(a.carbohidratos_g),
    grasa_g: Number(a.grasa_g),
    fibra_g: Number(a.fibra_g),
    porciones: ((a.porciones as { nombre: string; gramos: number }[] | null) ?? []).map((p) => ({ nombre: p.nombre, gramos: Number(p.gramos) })),
  }
}

// ---------------------------------------------------------------------
// Registrar comida
// ---------------------------------------------------------------------
const numero = z.coerce.number().finite()
const itemCatalogo = z.object({
  alimento_id: z.uuid(),
  cantidad: numero.positive().max(100000),
  unidad: z.string().min(1).max(40),
})
const itemManual = z.object({
  nombre: z.string().trim().min(1).max(120),
  cantidad: numero.positive().max(100000),
  unidad: z.string().trim().min(1).max(40),
  gramos: numero.positive().max(100000),
  calorias: numero.min(0).max(20000),
  proteina_g: numero.min(0).max(2000),
  carbohidratos_g: numero.min(0).max(2000),
  grasa_g: numero.min(0).max(2000),
  fibra_g: numero.min(0).max(2000).default(0),
  guardar: z.boolean().default(false),
})
const esquemaComida = z.object({
  tipo: z.enum(['desayuno', 'almuerzo', 'cena', 'snack']),
  fecha_hora: z.iso.datetime({ offset: true }),
  notas: z.string().trim().max(500).optional(),
  items: z.array(z.union([itemCatalogo, itemManual])).min(1, 'Agrega al menos un alimento.').max(40),
})

export type EstadoRegistro = { error?: string }

export async function registrarComida(_: EstadoRegistro, form: FormData): Promise<EstadoRegistro> {
  let bruto: unknown
  try {
    bruto = JSON.parse(String(form.get('datos') ?? ''))
  } catch {
    return { error: 'Datos no válidos.' }
  }
  const r = esquemaComida.safeParse(bruto)
  if (!r.success) return { error: r.error.issues[0].message }
  const d = r.data
  const { supabase, usuarioId, zona } = await datosUsuario()

  // Valores del catálogo leídos en el servidor (no se confía en el navegador).
  const ids = d.items.flatMap((i) => ('alimento_id' in i ? [i.alimento_id] : []))
  const catalogo = new Map<string, AlimentoBuscado>()
  if (ids.length) {
    const { data, error } = await supabase.from('alimentos').select(COLUMNAS_ALIMENTO).in('id', ids)
    if (error) return { error: error.message }
    for (const a of data ?? []) catalogo.set(a.id as string, normalizarAlimento(a))
  }

  const filas = []
  for (const i of d.items) {
    if ('alimento_id' in i) {
      const a = catalogo.get(i.alimento_id)
      if (!a) return { error: 'Uno de los alimentos ya no existe.' }
      const gramos = aGramos(i.cantidad, i.unidad, a.porciones)
      if (gramos === null) return { error: `Unidad "${i.unidad}" no válida para ${a.nombre}.` }
      filas.push({ alimento_id: a.id, nombre_alimento: a.nombre, cantidad: i.cantidad, unidad: i.unidad, gramos, ...macrosDeGramos(a, gramos) })
    } else {
      let alimentoId: string | null = null
      if (i.guardar) {
        const por100 = por100gDeTotales(i, i.gramos)
        const nuevo = await supabase.from('alimentos')
          .insert({ usuario_id: usuarioId, nombre: i.nombre, fuente: 'usuario', ...por100 })
          .select('id').single()
        if (nuevo.error) return { error: `No se pudo guardar el alimento: ${nuevo.error.message}` }
        alimentoId = nuevo.data.id
      }
      filas.push({
        alimento_id: alimentoId, nombre_alimento: i.nombre, cantidad: i.cantidad, unidad: i.unidad, gramos: redondear(i.gramos),
        calorias: redondear(i.calorias), proteina_g: redondear(i.proteina_g), carbohidratos_g: redondear(i.carbohidratos_g),
        grasa_g: redondear(i.grasa_g), fibra_g: redondear(i.fibra_g),
      })
    }
  }

  const comida = await supabase.from('comidas')
    .insert({ usuario_id: usuarioId, tipo: d.tipo, fecha_hora: d.fecha_hora, notas: d.notas || null })
    .select('id').single()
  if (comida.error) return { error: `No se pudo guardar la comida: ${comida.error.message}` }

  const items = await supabase.from('comida_items').insert(filas.map((f) => ({ ...f, comida_id: comida.data.id, usuario_id: usuarioId })))
  if (items.error) {
    await supabase.from('comidas').delete().eq('id', comida.data.id)
    return { error: `No se pudieron guardar los alimentos: ${items.error.message}` }
  }

  revalidatePath('/', 'layout')
  redirect(`/?fecha=${fechaEnZona(new Date(d.fecha_hora), zona)}`)
}

// ---------------------------------------------------------------------
// Registrar actividad y peso
// ---------------------------------------------------------------------
const esquemaActividad = z.object({
  tipo: z.string().trim().min(1, 'Escribe el tipo de actividad.').max(80),
  fecha_hora: z.iso.datetime({ offset: true }),
  duracion_min: z.coerce.number().int().min(1, 'Duración entre 1 y 1440 min.').max(1440, 'Duración entre 1 y 1440 min.'),
  intensidad: z.enum(['baja', 'moderada', 'alta']),
  calorias_estimadas: z.union([z.literal('').transform(() => null), z.coerce.number().int().min(0).max(10000)]),
  notas: z.string().trim().max(500).optional(),
})

export async function registrarActividad(_: EstadoRegistro, form: FormData): Promise<EstadoRegistro> {
  const r = esquemaActividad.safeParse(Object.fromEntries(form))
  if (!r.success) return { error: r.error.issues[0].message }
  const { supabase, usuarioId, zona } = await datosUsuario()
  const { error } = await supabase.from('actividades').insert({ ...r.data, notas: r.data.notas || null, usuario_id: usuarioId })
  if (error) return { error: `No se pudo guardar: ${error.message}` }
  revalidatePath('/', 'layout')
  redirect(`/?fecha=${fechaEnZona(new Date(r.data.fecha_hora), zona)}`)
}

const esquemaPeso = z.object({
  fecha: z.string().refine(esFechaValida, 'Fecha no válida.'),
  peso_kg: z.coerce.number().min(20, 'Peso entre 20 y 400 kg.').max(400, 'Peso entre 20 y 400 kg.'),
})

export async function registrarPeso(_: EstadoRegistro, form: FormData): Promise<EstadoRegistro> {
  const r = esquemaPeso.safeParse(Object.fromEntries(form))
  if (!r.success) return { error: r.error.issues[0].message }
  const { supabase, usuarioId, hoy } = await datosUsuario()
  if (r.data.fecha > hoy) return { error: 'La fecha no puede ser futura.' }
  const { error } = await supabase.from('mediciones_peso')
    .upsert({ usuario_id: usuarioId, ...r.data }, { onConflict: 'usuario_id,fecha' })
  if (error) return { error: `No se pudo guardar: ${error.message}` }
  revalidatePath('/', 'layout')
  redirect('/historial')
}

// ---------------------------------------------------------------------
// Editar la cantidad de un alimento ya registrado
// ---------------------------------------------------------------------
const esquemaEditar = z.object({
  id: z.uuid(),
  cantidad: z.coerce.number().finite().positive('La cantidad debe ser mayor que 0.').max(100000),
  unidad: z.string().trim().min(1).max(40),
})

export async function actualizarItem(_: EstadoRegistro, form: FormData): Promise<EstadoRegistro> {
  const r = esquemaEditar.safeParse(Object.fromEntries(form))
  if (!r.success) return { error: r.error.issues[0].message }
  const { id, cantidad, unidad } = r.data
  const { supabase, zona } = await datosUsuario()

  const { data: item } = await supabase.from('comida_items')
    .select('id, alimento_id, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, comidas(fecha_hora)')
    .eq('id', id).maybeSingle()
  if (!item) return { error: 'Ese alimento ya no existe.' }

  let cambios: Record<string, number | string>
  const alimento = item.alimento_id
    ? (await supabase.from('alimentos').select(COLUMNAS_ALIMENTO).eq('id', item.alimento_id).maybeSingle()).data
    : null
  if (alimento) {
    // Del catálogo: se recalcula con los valores por 100 g y sus porciones.
    const a = normalizarAlimento(alimento)
    const gramos = aGramos(cantidad, unidad, a.porciones)
    if (gramos === null) return { error: `Unidad "${unidad}" no válida para ${a.nombre}.` }
    cambios = { cantidad, unidad, gramos, ...macrosDeGramos(a, gramos) }
  } else {
    // Cargado a mano: se escala en proporción a la cantidad, con la misma unidad.
    const f = cantidad / Number(item.cantidad)
    cambios = {
      cantidad,
      gramos: redondear(Number(item.gramos) * f),
      calorias: redondear(Number(item.calorias) * f),
      proteina_g: redondear(Number(item.proteina_g) * f),
      carbohidratos_g: redondear(Number(item.carbohidratos_g) * f),
      grasa_g: redondear(Number(item.grasa_g) * f),
      fibra_g: redondear(Number(item.fibra_g) * f),
    }
  }

  const { error } = await supabase.from('comida_items').update(cambios).eq('id', id)
  if (error) return { error: `No se pudo guardar: ${error.message}` }
  revalidatePath('/', 'layout')
  const comida = item.comidas as unknown as { fecha_hora: string } | null
  redirect(comida ? `/?fecha=${fechaEnZona(new Date(comida.fecha_hora), zona)}` : '/')
}
