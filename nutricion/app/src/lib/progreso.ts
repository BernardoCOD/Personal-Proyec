import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sumarDias } from './fechas'
import { calcularRacha, estadoDia, ultimasSemanas, type DiaResumen, type EstadoDia } from './racha'

/** Días de historia que se miran para rachas y el panel. */
export const DIAS_HISTORIA = 180

/** Carga el resumen por día y calcula rachas y semanas. */
export async function cargarProgreso(supabase: SupabaseClient, hoy: string, semanas = 8) {
  const desde = sumarDias(hoy, -DIAS_HISTORIA)
  const { data, error } = await supabase.rpc('dias_resumen', { desde, hasta: hoy })
  if (error) throw new Error(error.message)
  const porFecha = new Map<string, DiaResumen>()
  for (const d of (data ?? []) as Record<string, unknown>[]) {
    porFecha.set(d.fecha as string, {
      fecha: d.fecha as string,
      secciones: Number(d.secciones),
      calorias: Number(d.calorias),
      proteina_g: Number(d.proteina_g),
      carbohidratos_g: Number(d.carbohidratos_g),
      grasa_g: Number(d.grasa_g),
      meta_calorias: d.meta_calorias == null ? null : Number(d.meta_calorias),
      meta_proteina_g: d.meta_proteina_g == null ? null : Number(d.meta_proteina_g),
      meta_carbohidratos_g: d.meta_carbohidratos_g == null ? null : Number(d.meta_carbohidratos_g),
      meta_grasas_g: d.meta_grasas_g == null ? null : Number(d.meta_grasas_g),
    })
  }
  const estados = new Map<string, EstadoDia>([...porFecha].map(([f, d]) => [f, estadoDia(d)]))
  return {
    porFecha,
    estados,
    registro: calcularRacha(estados, hoy, desde, 'registro'),
    cumplimiento: calcularRacha(estados, hoy, desde, 'cumplimiento'),
    semanas: ultimasSemanas(porFecha, hoy, semanas),
  }
}
