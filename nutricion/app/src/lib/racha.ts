// Rachas y cumplimiento. Funciones puras con pruebas.
//
//  Día registrado (🟡): anotaste al menos 3 comidas distintas ese día.
//  Día cumplido  (🟢): registrado, calorías dentro de ±10 % de la meta,
//                      proteína ≥ 90 %, y carbohidratos y grasas dentro
//                      de ±15 % de sus metas.
//  Racha: días seguidos que cumplen la regla. Hoy no la rompe mientras
//  el día sigue en curso: si hoy aún no cumple, se cuenta desde ayer.

import { lunesDeLaSemana, sumarDias } from './fechas'

export const REGLAS = {
  seccionesMinimas: 3,
  caloriasMin: 0.9,
  caloriasMax: 1.1,
  proteinaMin: 0.9,
  carbohidratosMin: 0.85,
  carbohidratosMax: 1.15,
  grasasMin: 0.85,
  grasasMax: 1.15,
} as const

/** La regla en palabras, para mostrarla en la app y en Claude. */
export const TEXTO_REGLAS = {
  registrado: `al menos ${REGLAS.seccionesMinimas} comidas`,
  cumplido: 'calorías ±10 %, proteína desde 90 %, carbohidratos y grasas ±15 % de tus metas',
}

export type DiaResumen = {
  fecha: string
  secciones: number
  calorias: number
  proteina_g: number
  carbohidratos_g: number
  grasa_g: number
  meta_calorias: number | null
  meta_proteina_g: number | null
  meta_carbohidratos_g: number | null
  meta_grasas_g: number | null
}

export type EstadoDia = 'vacio' | 'registrado' | 'cumplido'

export function estadoDia(d: DiaResumen | undefined): EstadoDia {
  if (!d || d.secciones < REGLAS.seccionesMinimas) return 'vacio'
  if (!d.meta_calorias || !d.meta_proteina_g || !d.meta_carbohidratos_g || !d.meta_grasas_g) return 'registrado'
  const kcal = d.calorias / d.meta_calorias
  const prot = d.proteina_g / d.meta_proteina_g
  const carb = d.carbohidratos_g / d.meta_carbohidratos_g
  const gras = d.grasa_g / d.meta_grasas_g
  const cumple =
    kcal >= REGLAS.caloriasMin && kcal <= REGLAS.caloriasMax &&
    prot >= REGLAS.proteinaMin &&
    carb >= REGLAS.carbohidratosMin && carb <= REGLAS.carbohidratosMax &&
    gras >= REGLAS.grasasMin && gras <= REGLAS.grasasMax
  return cumple ? 'cumplido' : 'registrado'
}

const cumple = (e: EstadoDia, nivel: 'registro' | 'cumplimiento') =>
  nivel === 'registro' ? e !== 'vacio' : e === 'cumplido'

export type Racha = { actual: number; mejor: number; hoyCuenta: boolean }

/** Racha actual (hasta hoy, o hasta ayer si hoy aún no cumple) y la mejor del período. */
export function calcularRacha(estados: Map<string, EstadoDia>, hoy: string, desde: string, nivel: 'registro' | 'cumplimiento'): Racha {
  const hoyCuenta = cumple(estados.get(hoy) ?? 'vacio', nivel)
  let actual = 0
  for (let f = hoyCuenta ? hoy : sumarDias(hoy, -1); f >= desde && cumple(estados.get(f) ?? 'vacio', nivel); f = sumarDias(f, -1)) actual++
  let mejor = 0
  let seguidos = 0
  for (let f = desde; f <= hoy; f = sumarDias(f, 1)) {
    seguidos = cumple(estados.get(f) ?? 'vacio', nivel) ? seguidos + 1 : 0
    mejor = Math.max(mejor, seguidos)
  }
  return { actual, mejor, hoyCuenta }
}

export type Semana = {
  lunes: string
  /** Días de la semana que ya pasaron o son hoy (1 a 7). */
  dias: number
  registrados: number
  cumplidos: number
  /** Promedio de calorías y proteína como % de la meta, solo en días registrados. null si no hubo. */
  caloriasPct: number | null
  proteinaPct: number | null
  estados: EstadoDia[]
}

export function resumirSemana(porFecha: Map<string, DiaResumen>, lunes: string, hoy: string): Semana {
  const estados: EstadoDia[] = []
  let dias = 0, registrados = 0, cumplidos = 0, kcal = 0, prot = 0, conMeta = 0
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(lunes, i)
    const d = porFecha.get(f)
    const e = estadoDia(d)
    estados.push(e)
    if (f > hoy) continue
    dias++
    if (e === 'vacio') continue
    registrados++
    if (e === 'cumplido') cumplidos++
    if (d?.meta_calorias && d.meta_proteina_g) {
      kcal += d.calorias / d.meta_calorias
      prot += d.proteina_g / d.meta_proteina_g
      conMeta++
    }
  }
  return {
    lunes, dias, registrados, cumplidos, estados,
    caloriasPct: conMeta ? Math.round((kcal / conMeta) * 100) : null,
    proteinaPct: conMeta ? Math.round((prot / conMeta) * 100) : null,
  }
}

/** Las últimas `n` semanas (de lunes a domingo), de la más antigua a la actual. */
export function ultimasSemanas(porFecha: Map<string, DiaResumen>, hoy: string, n: number): Semana[] {
  const actual = lunesDeLaSemana(hoy)
  return Array.from({ length: n }, (_, i) => resumirSemana(porFecha, sumarDias(actual, -7 * (n - 1 - i)), hoy))
}
