import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { clienteServidor } from './supabase/servidor'
import { fechaEnZona, ZONA_POR_DEFECTO } from './fechas'
import type { NivelActividad, Sexo, TipoObjetivo } from './calculos'

export type Perfil = {
  id: string
  nombre: string | null
  sexo: Sexo | null
  fecha_nacimiento: string | null
  talla_cm: number | null
  nivel_actividad: NivelActividad | null
  dias_gimnasio: number | null
  tipo_ejercicio: string[]
  zona_horaria: string
}

export type Objetivo = {
  id: string
  tipo: TipoObjetivo
  fecha_inicio: string
  fecha_fin: string | null
  meta_calorias: number
  meta_proteina_g: number
  meta_carbohidratos_g: number
  meta_grasas_g: number
}

export type PerfilCompleto = Perfil & {
  sexo: Sexo
  fecha_nacimiento: string
  talla_cm: number
  nivel_actividad: NivelActividad
}

export function esPerfilCompleto(p: Perfil | null): p is PerfilCompleto {
  return Boolean(p && p.sexo && p.fecha_nacimiento && p.talla_cm && p.nivel_actividad)
}

/**
 * Capa de acceso a datos: lee la sesión una vez por petición.
 * Sin sesión, manda a /login. Todas las consultas pasan por RLS.
 */
export const sesion = cache(async () => {
  const supabase = await clienteServidor()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (!id) redirect('/login')
  return { supabase, usuarioId: id, email: (data.claims.email as string | undefined) ?? null }
})

export const datosUsuario = cache(async () => {
  const { supabase, usuarioId, email } = await sesion()
  const [perfil, objetivo, peso] = await Promise.all([
    supabase.from('perfiles').select('*').eq('id', usuarioId).maybeSingle(),
    supabase.from('objetivos').select('*').eq('activo', true).maybeSingle(),
    supabase.from('mediciones_peso').select('fecha, peso_kg').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (perfil.error) throw new Error(`No se pudo leer el perfil: ${perfil.error.message}`)
  const p = perfil.data as Perfil | null
  const zona = p?.zona_horaria ?? ZONA_POR_DEFECTO
  return {
    supabase,
    usuarioId,
    email,
    perfil: p,
    objetivo: (objetivo.data as Objetivo | null) ?? null,
    ultimoPeso: peso.data ? { fecha: peso.data.fecha as string, pesoKg: Number(peso.data.peso_kg) } : null,
    zona,
    hoy: fechaEnZona(new Date(), zona),
  }
})

/** Igual que datosUsuario, pero manda a /registro si falta completar el perfil o el objetivo. */
export async function datosRegistrados() {
  const d = await datosUsuario()
  if (!esPerfilCompleto(d.perfil) || !d.objetivo || !d.ultimoPeso) redirect('/registro')
  return { ...d, perfil: d.perfil, objetivo: d.objetivo, ultimoPeso: d.ultimoPeso }
}
