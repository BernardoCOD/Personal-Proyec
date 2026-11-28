import 'server-only'
import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { calcularPlan, caloriasActividad, OBJETIVOS } from './calculos'
import { esFechaValida, fechaEnZona, rangoDelDia, sumarDias, ZONA_POR_DEFECTO } from './fechas'
import { configSupabase } from './supabase/config'
import { cargarProgreso } from './progreso'
import { TEXTO_REGLAS } from './racha'
import {
  borrarItem, buscar, cambiarCantidad, ErrorUsuario, guardarComida, itemCatalogo, itemManual, TIPOS_COMIDA, type Ctx,
} from './servicio'

// =====================================================================
// Conector de Claude (MCP): herramientas para registrar y consultar.
// Cada llamada usa el token OAuth del usuario, así que RLS limita todo
// a sus propios datos.
// =====================================================================

export const INSTRUCCIONES = `Nutri es la app de nutrición personal del usuario (Perú, hora de Lima).
Cuando el usuario cuente qué comió:
1. Usa buscar_alimento para cada alimento (en español; el catálogo CENAN tiene alimentos y platos peruanos, y USDA tiene productos en inglés).
2. Elige el resultado más fiel (cocido vs. crudo, frito, etc.) y una unidad: g, kg, lb, oz, ml o una de sus porciones caseras (taza, unidad mediana...).
3. Si la cantidad es ambigua y cambia mucho las calorías, pregunta antes de registrar. Si el usuario no da hora, usa la actual; si no dice el tipo, dedúcelo de la hora.
4. Para platos sin porción en el catálogo, estima los gramos (un plato de fondo suele pesar 350-450 g) y dilo.
5. Si algo no está en el catálogo, regístralo con valores estimados (alimento manual) y avisa que son aproximados.
6. Registra todo con registrar_comida y luego muestra un resumen breve con resumen_dia (consumido vs. meta, lo que falta y la racha; celebra las rachas y anima si hoy aún no suma).
Responde siempre en español.`

function cliente(token: string): SupabaseClient {
  const { url, clave } = configSupabase()
  return createClient(url, clave, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Valida el token de acceso emitido por Supabase Auth (OAuth 2.1). */
export async function verificarToken(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined
  const { data, error } = await cliente(token).auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims?.sub || claims.role !== 'authenticated') return undefined
  return {
    token,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : 'nutri',
    scopes: [],
    expiresAt: typeof claims.exp === 'number' ? claims.exp : undefined,
    extra: { usuarioId: claims.sub },
  }
}

async function contexto(auth: AuthInfo | undefined): Promise<Ctx & { hoy: string }> {
  const usuarioId = auth?.extra?.usuarioId
  if (!auth || typeof usuarioId !== 'string') throw new ErrorUsuario('No hay sesión. Vuelve a conectar Nutri en Claude.')
  const supabase = cliente(auth.token)
  const { data } = await supabase.from('perfiles').select('zona_horaria').eq('id', usuarioId).maybeSingle()
  const zona = (data?.zona_horaria as string | undefined) ?? ZONA_POR_DEFECTO
  return { supabase, usuarioId, zona, hoy: fechaEnZona(new Date(), zona) }
}

type Resultado = { content: { type: 'text'; text: string }[]; isError?: boolean }

function ok(datos: unknown): Resultado {
  return { content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }] }
}

/** Ejecuta una herramienta con el contexto del usuario y convierte los errores en mensajes claros. */
function con<A>(fn: (args: A, ctx: Ctx & { hoy: string }) => Promise<unknown>) {
  return async (args: A, extra: { http?: { authInfo?: AuthInfo } }): Promise<Resultado> => {
    try {
      return ok(await fn(args, await contexto(extra.http?.authInfo)))
    } catch (e) {
      const msg = e instanceof ErrorUsuario ? e.message : `Error inesperado: ${(e as Error).message}`
      return { content: [{ type: 'text', text: msg }], isError: true }
    }
  }
}

const r1 = (n: unknown) => Math.round(Number(n) * 10) / 10
const fechaOpcional = z.string().refine(esFechaValida, 'Usa el formato AAAA-MM-DD.').optional()
const fechaHoraOpcional = z.iso.datetime({ offset: true }).optional()
  .describe('Fecha y hora ISO 8601 con zona, p. ej. 2026-11-27T13:30:00-05:00. Si se omite, ahora.')

// ---------------------------------------------------------------------
// Resumen del día
// ---------------------------------------------------------------------
async function resumenDia(ctx: Ctx & { hoy: string }, fecha: string) {
  const { supabase, zona } = ctx
  const { desde, hasta } = rangoDelDia(fecha, zona)
  const [comidas, actividades, objetivo, peso] = await Promise.all([
    supabase.from('comidas')
      .select('id, tipo, fecha_hora, notas, comida_items(id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g)')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora'),
    supabase.from('actividades').select('id, tipo, fecha_hora, duracion_min, intensidad, calorias_estimadas')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora'),
    supabase.from('objetivos').select('tipo, meta_calorias, meta_proteina_g, meta_carbohidratos_g, meta_grasas_g').eq('activo', true).maybeSingle(),
    supabase.from('mediciones_peso').select('peso_kg').eq('fecha', fecha).maybeSingle(),
  ])
  if (comidas.error) throw new Error(comidas.error.message)

  type ItemDb = { id: string; nombre_alimento: string; cantidad: number; unidad: string; gramos: number; calorias: number; proteina_g: number; carbohidratos_g: number; grasa_g: number }
  const total = { calorias: 0, proteina_g: 0, carbohidratos_g: 0, grasa_g: 0 }
  const porTipo: Record<string, { comida_ids: string[]; calorias: number; items: unknown[] }> = {}
  for (const c of comidas.data ?? []) {
    const s = (porTipo[c.tipo] ??= { comida_ids: [], calorias: 0, items: [] })
    s.comida_ids.push(c.id)
    for (const i of (c.comida_items ?? []) as ItemDb[]) {
      total.calorias += Number(i.calorias)
      total.proteina_g += Number(i.proteina_g)
      total.carbohidratos_g += Number(i.carbohidratos_g)
      total.grasa_g += Number(i.grasa_g)
      s.calorias += Number(i.calorias)
      s.items.push({ item_id: i.id, alimento: i.nombre_alimento, cantidad: `${r1(i.cantidad)} ${i.unidad}`, gramos: r1(i.gramos), kcal: r1(i.calorias) })
    }
  }
  const progreso = fecha === ctx.hoy ? await cargarProgreso(supabase, ctx.hoy, 1) : null
  const o = objetivo.data
  const meta = o ? { calorias: o.meta_calorias, proteina_g: Number(o.meta_proteina_g), carbohidratos_g: Number(o.meta_carbohidratos_g), grasa_g: Number(o.meta_grasas_g) } : null
  return {
    fecha,
    objetivo: o?.tipo ?? null,
    consumido: { calorias: r1(total.calorias), proteina_g: r1(total.proteina_g), carbohidratos_g: r1(total.carbohidratos_g), grasa_g: r1(total.grasa_g) },
    meta,
    faltan: meta ? {
      calorias: r1(meta.calorias - total.calorias), proteina_g: r1(meta.proteina_g - total.proteina_g),
      carbohidratos_g: r1(meta.carbohidratos_g - total.carbohidratos_g), grasa_g: r1(meta.grasa_g - total.grasa_g),
    } : null,
    comidas: Object.fromEntries(TIPOS_COMIDA.map((t) => [t, porTipo[t] ? { ...porTipo[t], calorias: r1(porTipo[t].calorias) } : null])),
    actividades: (actividades.data ?? []).map((a) => ({ actividad_id: a.id, tipo: a.tipo, duracion_min: a.duracion_min, intensidad: a.intensidad, kcal: a.calorias_estimadas })),
    peso_kg: peso.data ? Number(peso.data.peso_kg) : null,
    racha: progreso ? {
      dias_registrando: progreso.registro.actual,
      dias_cumpliendo_metas: progreso.cumplimiento.actual,
      hoy_ya_suma: progreso.registro.hoyCuenta,
      regla: `Registrado: ${TEXTO_REGLAS.registrado}. Cumplido: ${TEXTO_REGLAS.cumplido}.`,
    } : null,
  }
}

// ---------------------------------------------------------------------
// Registro de herramientas
// ---------------------------------------------------------------------
export function registrarHerramientas(server: McpServer) {
  server.registerTool('buscar_alimento', {
    title: 'Buscar alimento',
    description: 'Busca alimentos en el catálogo (CENAN Perú, USDA y los alimentos propios del usuario). Devuelve el id, los valores por 100 g y las porciones caseras disponibles. Sin tildes; acepta varias palabras ("arroz pollo") y plurales.',
    inputSchema: z.object({
      texto: z.string().min(2).max(60).describe('Nombre del alimento, p. ej. "arroz cocido", "lomo saltado", "chicken breast".'),
      limite: z.number().int().min(1).max(25).optional().describe('Máximo de resultados (por defecto 8).'),
    }),
    annotations: { readOnlyHint: true },
  }, con(async ({ texto, limite }: { texto: string; limite?: number }, { supabase }) => {
    const lista = await buscar(supabase, texto, limite ?? 8)
    return lista.map((a) => ({
      alimento_id: a.id, nombre: a.nombre, marca: a.marca, fuente: a.fuente,
      por_100g: { kcal: a.calorias, proteina_g: a.proteina_g, carbohidratos_g: a.carbohidratos_g, grasa_g: a.grasa_g, fibra_g: a.fibra_g },
      porciones: a.porciones,
    }))
  }))

  server.registerTool('registrar_comida', {
    title: 'Registrar comida',
    description: 'Guarda una comida con uno o más alimentos. Para alimentos del catálogo envía alimento_id, cantidad y unidad (g, kg, lb, oz, ml o el nombre exacto de una porción). Para algo que no está en el catálogo envía nombre, gramos y las macros TOTALES de esa cantidad. Las macros del catálogo se calculan en el servidor.',
    inputSchema: z.object({
      tipo: z.enum(TIPOS_COMIDA).describe('desayuno, almuerzo, cena o snack'),
      fecha_hora: fechaHoraOpcional,
      notas: z.string().max(500).optional(),
      items: z.array(z.union([itemCatalogo, itemManual])).min(1).max(40),
    }),
  }, con(async (args: { tipo: (typeof TIPOS_COMIDA)[number]; fecha_hora?: string; notas?: string; items: z.infer<typeof itemCatalogo | typeof itemManual>[] }, ctx) => {
    const r = await guardarComida(ctx, { ...args, fecha_hora: args.fecha_hora ?? new Date().toISOString() })
    return {
      guardado: true,
      comida_id: r.comidaId,
      fecha: r.fecha,
      items: r.items.map((i) => ({ item_id: i.id, alimento: i.nombre_alimento, cantidad: `${r1(i.cantidad)} ${i.unidad}`, gramos: r1(i.gramos), kcal: r1(i.calorias), proteina_g: r1(i.proteina_g), carbohidratos_g: r1(i.carbohidratos_g), grasa_g: r1(i.grasa_g) })),
      total_comida_kcal: r1(r.items.reduce((s, i) => s + Number(i.calorias), 0)),
    }
  }))

  server.registerTool('resumen_dia', {
    title: 'Resumen del día',
    description: 'Calorías y macros consumidas frente a la meta y lo que falta; comidas del día por tipo (con item_id para editar o borrar), actividad y peso.',
    inputSchema: z.object({ fecha: fechaOpcional.describe('AAAA-MM-DD; por defecto hoy.') }),
    annotations: { readOnlyHint: true },
  }, con(async ({ fecha }: { fecha?: string }, ctx) => resumenDia(ctx, fecha ?? ctx.hoy)))

  server.registerTool('editar_registro', {
    title: 'Editar alimento registrado',
    description: 'Cambia la cantidad (y opcionalmente la unidad) de un alimento ya registrado y recalcula sus macros. Usa el item_id de resumen_dia o registrar_comida.',
    inputSchema: z.object({
      item_id: z.uuid(),
      cantidad: z.number().positive().max(100000),
      unidad: z.string().min(1).max(40).optional(),
    }),
  }, con(async ({ item_id, cantidad, unidad }: { item_id: string; cantidad: number; unidad?: string }, ctx) => cambiarCantidad(ctx, item_id, cantidad, unidad)))

  server.registerTool('eliminar_registro', {
    title: 'Eliminar registro',
    description: 'Borra un alimento registrado (item_id), una comida completa (comida_id) o una actividad (actividad_id). Envía solo uno.',
    inputSchema: z.object({ item_id: z.uuid().optional(), comida_id: z.uuid().optional(), actividad_id: z.uuid().optional() }),
    annotations: { destructiveHint: true },
  }, con(async ({ item_id, comida_id, actividad_id }: { item_id?: string; comida_id?: string; actividad_id?: string }, { supabase }) => {
    if ([item_id, comida_id, actividad_id].filter(Boolean).length !== 1) throw new ErrorUsuario('Envía exactamente uno: item_id, comida_id o actividad_id.')
    if (item_id) {
      const r = await borrarItem(supabase, item_id)
      if (!r) throw new ErrorUsuario('Ese alimento registrado no existe.')
      return { borrado: r.nombre, comida_borrada_por_quedar_vacia: r.comidaBorrada }
    }
    const tabla = comida_id ? 'comidas' : 'actividades'
    const { data } = await supabase.from(tabla).delete().eq('id', (comida_id ?? actividad_id)!).select('id')
    if (!data?.length) throw new ErrorUsuario('No existe ese registro.')
    return { borrado: tabla === 'comidas' ? 'comida completa' : 'actividad' }
  }))

  server.registerTool('registrar_actividad', {
    title: 'Registrar actividad física',
    description: 'Guarda ejercicio. Si no se dan calorías, se estiman con METs según la intensidad y el último peso del usuario.',
    inputSchema: z.object({
      tipo: z.string().min(1).max(80).describe('p. ej. pesas, correr, fútbol, caminar'),
      duracion_min: z.number().int().min(1).max(1440),
      intensidad: z.enum(['baja', 'moderada', 'alta']),
      calorias_estimadas: z.number().int().min(0).max(10000).optional(),
      fecha_hora: fechaHoraOpcional,
      notas: z.string().max(500).optional(),
    }),
  }, con(async (a: { tipo: string; duracion_min: number; intensidad: 'baja' | 'moderada' | 'alta'; calorias_estimadas?: number; fecha_hora?: string; notas?: string }, { supabase, usuarioId, zona }) => {
    let kcal = a.calorias_estimadas
    if (kcal === undefined) {
      const { data } = await supabase.from('mediciones_peso').select('peso_kg').order('fecha', { ascending: false }).limit(1).maybeSingle()
      kcal = data ? caloriasActividad(Number(data.peso_kg), a.duracion_min, a.intensidad) : undefined
    }
    const fecha_hora = a.fecha_hora ?? new Date().toISOString()
    const { data, error } = await supabase.from('actividades')
      .insert({ usuario_id: usuarioId, tipo: a.tipo, duracion_min: a.duracion_min, intensidad: a.intensidad, calorias_estimadas: kcal ?? null, fecha_hora, notas: a.notas ?? null })
      .select('id').single()
    if (error) throw new ErrorUsuario(`No se pudo guardar: ${error.message}`)
    return { guardado: true, actividad_id: data.id, fecha: fechaEnZona(new Date(fecha_hora), zona), calorias_estimadas: kcal ?? null }
  }))

  server.registerTool('actualizar_peso', {
    title: 'Registrar peso',
    description: 'Guarda el peso del día (reemplaza si ya había uno esa fecha).',
    inputSchema: z.object({ peso_kg: z.number().min(20).max(400), fecha: fechaOpcional.describe('AAAA-MM-DD; por defecto hoy.') }),
  }, con(async ({ peso_kg, fecha }: { peso_kg: number; fecha?: string }, { supabase, usuarioId, hoy }) => {
    const f = fecha ?? hoy
    if (f > hoy) throw new ErrorUsuario('La fecha no puede ser futura.')
    const { data: previo } = await supabase.from('mediciones_peso').select('fecha, peso_kg').lt('fecha', f).order('fecha', { ascending: false }).limit(1).maybeSingle()
    const { error } = await supabase.from('mediciones_peso').upsert({ usuario_id: usuarioId, fecha: f, peso_kg }, { onConflict: 'usuario_id,fecha' })
    if (error) throw new ErrorUsuario(`No se pudo guardar: ${error.message}`)
    return { guardado: true, fecha: f, peso_kg, anterior: previo ? { fecha: previo.fecha, peso_kg: Number(previo.peso_kg), cambio_kg: r1(peso_kg - Number(previo.peso_kg)) } : null }
  }))

  server.registerTool('ver_objetivo', {
    title: 'Ver objetivo y metas',
    description: 'Perfil del usuario, metabolismo basal, gasto diario, etapa actual (objetivo, fechas) y metas diarias de calorías y macros.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, con(async (_: Record<string, never>, ctx) => {
    const d = await datosPlan(ctx)
    return {
      perfil: d.perfil, peso_kg: d.pesoKg, edad: d.plan?.edad ?? null, metabolismo_basal_kcal: d.plan?.tmb ?? null, gasto_diario_kcal: d.plan?.gasto ?? null,
      etapa: d.objetivo ? { objetivo: d.objetivo.tipo, desde: d.objetivo.fecha_inicio, hasta: d.objetivo.fecha_fin } : null,
      metas: d.objetivo ? { calorias: d.objetivo.meta_calorias, proteina_g: Number(d.objetivo.meta_proteina_g), carbohidratos_g: Number(d.objetivo.meta_carbohidratos_g), grasa_g: Number(d.objetivo.meta_grasas_g) } : null,
    }
  }))

  server.registerTool('cambiar_objetivo', {
    title: 'Cambiar de etapa',
    description: 'Empieza una nueva etapa (ganar músculo, mantener o bajar grasa) y recalcula las metas con el perfil y el último peso. Cierra la etapa anterior. Confirma con el usuario antes de usarla.',
    inputSchema: z.object({
      objetivo: z.enum(['ganar_musculo', 'mantener', 'bajar_grasa']),
      semanas: z.number().int().min(0).max(104).optional().describe('Duración en semanas; 0 u omitido = sin fecha de fin.'),
    }),
  }, con(async ({ objetivo, semanas }: { objetivo: 'ganar_musculo' | 'mantener' | 'bajar_grasa'; semanas?: number }, ctx) => {
    const d = await datosPlan(ctx)
    const p = d.perfil
    if (!p?.sexo || !p.fecha_nacimiento || !p.talla_cm || !p.nivel_actividad || !d.pesoKg) {
      throw new ErrorUsuario('Falta completar el perfil en la app (sexo, fecha de nacimiento, talla, actividad y peso).')
    }
    const plan = calcularPlan({ sexo: p.sexo, fechaNacimiento: p.fecha_nacimiento, tallaCm: Number(p.talla_cm), pesoKg: d.pesoKg, nivel: p.nivel_actividad, objetivo }, ctx.hoy)
    const { supabase, usuarioId, hoy } = ctx
    await supabase.from('objetivos').update({ activo: false, fecha_fin: hoy }).eq('activo', true).is('fecha_fin', null)
    await supabase.from('objetivos').update({ activo: false }).eq('activo', true)
    const { error } = await supabase.from('objetivos').insert({
      usuario_id: usuarioId, tipo: objetivo, fecha_inicio: hoy, fecha_fin: semanas ? sumarDias(hoy, semanas * 7) : null,
      meta_calorias: plan.metas.calorias, meta_proteina_g: plan.metas.proteinaG, meta_carbohidratos_g: plan.metas.carbohidratosG, meta_grasas_g: plan.metas.grasasG,
    })
    if (error) throw new ErrorUsuario(`No se pudo guardar: ${error.message}`)
    return { nueva_etapa: OBJETIVOS.find((o) => o.valor === objetivo)?.nombre, desde: hoy, semanas: semanas || null, gasto_diario_kcal: plan.gasto, metas: plan.metas }
  }))
}

async function datosPlan({ supabase, hoy }: Ctx & { hoy: string }) {
  const [perfil, objetivo, peso] = await Promise.all([
    supabase.from('perfiles').select('nombre, sexo, fecha_nacimiento, talla_cm, nivel_actividad, dias_gimnasio').maybeSingle(),
    supabase.from('objetivos').select('tipo, fecha_inicio, fecha_fin, meta_calorias, meta_proteina_g, meta_carbohidratos_g, meta_grasas_g').eq('activo', true).maybeSingle(),
    supabase.from('mediciones_peso').select('peso_kg').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])
  const p = perfil.data
  const pesoKg = peso.data ? Number(peso.data.peso_kg) : null
  const plan = p?.sexo && p.fecha_nacimiento && p.talla_cm && p.nivel_actividad && pesoKg
    ? calcularPlan({ sexo: p.sexo, fechaNacimiento: p.fecha_nacimiento, tallaCm: Number(p.talla_cm), pesoKg, nivel: p.nivel_actividad, objetivo: objetivo.data?.tipo ?? 'mantener' }, hoy)
    : null
  return { perfil: p, objetivo: objetivo.data, pesoKg, plan }
}
