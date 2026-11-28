import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { fechaEnZona } from './fechas'
import { aGramos, macrosDeGramos, por100gDeTotales, redondear, type Porcion, type ValoresPor100g } from './unidades'

// Lógica de registro compartida por la app (acciones) y el conector de Claude (MCP).
// Recibe un cliente de Supabase con la sesión del usuario: RLS se aplica siempre.

export type Ctx = { supabase: SupabaseClient; usuarioId: string; zona: string }

/** Error con un mensaje apto para mostrar al usuario. */
export class ErrorUsuario extends Error {}

export type AlimentoBuscado = ValoresPor100g & {
  id: string
  nombre: string
  marca: string | null
  fuente: string
  porciones: Porcion[]
}

export const COLUMNAS_ALIMENTO = 'id, nombre, marca, fuente, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, porciones(nombre, gramos)'

export function normalizarAlimento(a: Record<string, unknown>): AlimentoBuscado {
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

/** Búsqueda sin tildes, por varias palabras y con plurales (función buscar_alimentos). */
export async function buscar(supabase: SupabaseClient, texto: string, limite = 25): Promise<AlimentoBuscado[]> {
  const q = String(texto ?? '').trim().slice(0, 60)
  if (q.length < 2) return []
  const { data, error } = await supabase.rpc('buscar_alimentos', { texto: q, limite })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(normalizarAlimento)
}

// ---------------------------------------------------------------------
// Registrar comida
// ---------------------------------------------------------------------
const numero = z.coerce.number().finite()
export const itemCatalogo = z.object({
  alimento_id: z.uuid(),
  cantidad: numero.positive().max(100000),
  unidad: z.string().min(1).max(40),
})
export const itemManual = z.object({
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
export const TIPOS_COMIDA = ['desayuno', 'almuerzo', 'cena', 'snack'] as const
export const esquemaComida = z.object({
  tipo: z.enum(TIPOS_COMIDA),
  fecha_hora: z.iso.datetime({ offset: true }),
  notas: z.string().trim().max(500).optional(),
  items: z.array(z.union([itemCatalogo, itemManual])).min(1, 'Agrega al menos un alimento.').max(40),
})
export type DatosComida = z.infer<typeof esquemaComida>

export type FilaItem = {
  alimento_id: string | null
  nombre_alimento: string
  cantidad: number
  unidad: string
  gramos: number
  calorias: number
  proteina_g: number
  carbohidratos_g: number
  grasa_g: number
  fibra_g: number
}

/** Guarda una comida con sus alimentos. Las macros del catálogo se calculan aquí, nunca se reciben. */
export async function guardarComida({ supabase, usuarioId, zona }: Ctx, d: DatosComida) {
  const ids = d.items.flatMap((i) => ('alimento_id' in i ? [i.alimento_id] : []))
  const catalogo = new Map<string, AlimentoBuscado>()
  if (ids.length) {
    const { data, error } = await supabase.from('alimentos').select(COLUMNAS_ALIMENTO).in('id', ids)
    if (error) throw new Error(error.message)
    for (const a of data ?? []) catalogo.set(a.id as string, normalizarAlimento(a))
  }

  const filas: FilaItem[] = []
  for (const i of d.items) {
    if ('alimento_id' in i) {
      const a = catalogo.get(i.alimento_id)
      if (!a) throw new ErrorUsuario(`El alimento ${i.alimento_id} no existe.`)
      const gramos = aGramos(i.cantidad, i.unidad, a.porciones)
      if (gramos === null) {
        const validas = ['g', 'kg', 'lb', 'oz', 'ml', ...a.porciones.map((p) => p.nombre)].join(', ')
        throw new ErrorUsuario(`Unidad "${i.unidad}" no válida para ${a.nombre}. Usa: ${validas}.`)
      }
      filas.push({ alimento_id: a.id, nombre_alimento: a.nombre, cantidad: i.cantidad, unidad: i.unidad, gramos, ...macrosDeGramos(a, gramos) })
    } else {
      let alimentoId: string | null = null
      if (i.guardar) {
        const por100 = por100gDeTotales(i, i.gramos)
        const nuevo = await supabase.from('alimentos')
          .insert({ usuario_id: usuarioId, nombre: i.nombre, fuente: 'usuario', ...por100 })
          .select('id').single()
        if (nuevo.error) throw new ErrorUsuario(`No se pudo guardar el alimento: ${nuevo.error.message}`)
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
  if (comida.error) throw new ErrorUsuario(`No se pudo guardar la comida: ${comida.error.message}`)

  const items = await supabase.from('comida_items')
    .insert(filas.map((f) => ({ ...f, comida_id: comida.data.id, usuario_id: usuarioId })))
    .select('id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g')
  if (items.error) {
    await supabase.from('comidas').delete().eq('id', comida.data.id)
    throw new ErrorUsuario(`No se pudieron guardar los alimentos: ${items.error.message}`)
  }
  return { comidaId: comida.data.id as string, fecha: fechaEnZona(new Date(d.fecha_hora), zona), items: items.data }
}

// ---------------------------------------------------------------------
// Editar y borrar alimentos registrados
// ---------------------------------------------------------------------

/** Borra un alimento registrado; si la comida queda vacía, la borra también. */
export async function borrarItem(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from('comida_items').delete().eq('id', id).select('comida_id, nombre_alimento').maybeSingle()
  if (!data) return null
  const { count } = await supabase.from('comida_items').select('id', { count: 'exact', head: true }).eq('comida_id', data.comida_id)
  if (count === 0) await supabase.from('comidas').delete().eq('id', data.comida_id)
  return { nombre: data.nombre_alimento as string, comidaBorrada: count === 0 }
}

/** Cambia cantidad (y unidad, si viene del catálogo) y recalcula las macros. */
export async function cambiarCantidad({ supabase, zona }: Ctx, id: string, cantidad: number, unidad?: string) {
  const { data: item } = await supabase.from('comida_items')
    .select('id, alimento_id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, comidas(fecha_hora)')
    .eq('id', id).maybeSingle()
  if (!item) throw new ErrorUsuario('Ese alimento registrado no existe.')

  let cambios: Partial<FilaItem>
  const alimento = item.alimento_id
    ? (await supabase.from('alimentos').select(COLUMNAS_ALIMENTO).eq('id', item.alimento_id).maybeSingle()).data
    : null
  if (alimento) {
    const a = normalizarAlimento(alimento)
    const u = unidad ?? (item.unidad as string)
    const gramos = aGramos(cantidad, u, a.porciones)
    if (gramos === null) throw new ErrorUsuario(`Unidad "${u}" no válida para ${a.nombre}.`)
    cambios = { cantidad, unidad: u, gramos, ...macrosDeGramos(a, gramos) }
  } else {
    // Cargado a mano: se escala en proporción, con la misma unidad.
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
  if (error) throw new ErrorUsuario(`No se pudo guardar: ${error.message}`)
  const comida = item.comidas as unknown as { fecha_hora: string } | null
  return {
    nombre: item.nombre_alimento as string,
    antes: { cantidad: Number(item.cantidad), unidad: item.unidad as string, calorias: Number(item.calorias) },
    despues: cambios,
    fecha: comida ? fechaEnZona(new Date(comida.fecha_hora), zona) : null,
  }
}
