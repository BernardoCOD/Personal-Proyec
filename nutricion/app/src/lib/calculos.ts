// Cálculos de metabolismo, gasto diario y metas.
// Funciones puras: se usan en el servidor y en el navegador, y tienen pruebas.

export type Sexo = 'masculino' | 'femenino'
export type NivelActividad = 'sedentario' | 'ligero' | 'moderado' | 'muy_activo' | 'extremo'
export type TipoObjetivo = 'ganar_musculo' | 'mantener' | 'bajar_grasa'

export const FACTOR_ACTIVIDAD: Record<NivelActividad, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  muy_activo: 1.725,
  extremo: 1.9,
}

export const NIVELES_ACTIVIDAD: { valor: NivelActividad; nombre: string; detalle: string }[] = [
  { valor: 'sedentario', nombre: 'Sedentario', detalle: 'Trabajo sentado y casi nada de ejercicio' },
  { valor: 'ligero', nombre: 'Ligero', detalle: 'Ejercicio 1 a 2 días por semana' },
  { valor: 'moderado', nombre: 'Moderado', detalle: 'Ejercicio 3 a 4 días por semana' },
  { valor: 'muy_activo', nombre: 'Muy activo', detalle: 'Ejercicio intenso 5 a 6 días por semana' },
  { valor: 'extremo', nombre: 'Extremo', detalle: 'Entreno diario intenso o trabajo físico pesado' },
]

export const OBJETIVOS: { valor: TipoObjetivo; nombre: string; detalle: string }[] = [
  { valor: 'ganar_musculo', nombre: 'Ganar músculo', detalle: 'Superávit de ~10 %' },
  { valor: 'mantener', nombre: 'Mantener', detalle: 'Comer lo que gastas' },
  { valor: 'bajar_grasa', nombre: 'Bajar grasa', detalle: 'Déficit de ~20 %' },
]

/** Nivel sugerido según los días de gimnasio del cuestionario. */
export function nivelSugerido(diasGimnasio: number): NivelActividad {
  if (diasGimnasio <= 0) return 'sedentario'
  if (diasGimnasio <= 2) return 'ligero'
  if (diasGimnasio <= 4) return 'moderado'
  if (diasGimnasio <= 6) return 'muy_activo'
  return 'extremo'
}

/** Edad cumplida en años a la fecha de referencia (ambas 'AAAA-MM-DD'). */
export function calcularEdad(fechaNacimiento: string, hoy: string): number {
  const [an, mn, dn] = fechaNacimiento.split('-').map(Number)
  const [ah, mh, dh] = hoy.split('-').map(Number)
  let edad = ah - an
  if (mh < mn || (mh === mn && dh < dn)) edad--
  return edad
}

/** Metabolismo basal (kcal/día) con la fórmula de Mifflin-St Jeor. */
export function metabolismoBasal(p: { sexo: Sexo; pesoKg: number; tallaCm: number; edad: number }): number {
  const base = 10 * p.pesoKg + 6.25 * p.tallaCm - 5 * p.edad
  return base + (p.sexo === 'masculino' ? 5 : -161)
}

/** Gasto diario total = metabolismo basal × factor de actividad. */
export function gastoDiario(tmb: number, nivel: NivelActividad): number {
  return tmb * FACTOR_ACTIVIDAD[nivel]
}

const AJUSTE: Record<TipoObjetivo, { calorias: number; proteinaPorKg: number; grasaPct: number }> = {
  ganar_musculo: { calorias: 1.1, proteinaPorKg: 2.0, grasaPct: 0.25 },
  mantener: { calorias: 1.0, proteinaPorKg: 1.8, grasaPct: 0.28 },
  bajar_grasa: { calorias: 0.8, proteinaPorKg: 2.2, grasaPct: 0.25 },
}

const CALORIAS_MINIMAS = 1200

export type Metas = {
  calorias: number
  proteinaG: number
  carbohidratosG: number
  grasasG: number
}

/**
 * Metas diarias según el objetivo:
 * - calorías = gasto diario × ajuste (redondeado a 10, mínimo 1200)
 * - proteína por kg de peso, grasa como % de las calorías, carbohidratos el resto
 */
export function calcularMetas(gasto: number, pesoKg: number, objetivo: TipoObjetivo): Metas {
  const a = AJUSTE[objetivo]
  const calorias = Math.max(CALORIAS_MINIMAS, Math.round((gasto * a.calorias) / 10) * 10)
  const proteinaG = Math.round(pesoKg * a.proteinaPorKg)
  const grasasG = Math.round((calorias * a.grasaPct) / 9)
  const carbohidratosG = Math.max(0, Math.round((calorias - proteinaG * 4 - grasasG * 9) / 4))
  return { calorias, proteinaG, carbohidratosG, grasasG }
}

export type DatosCuerpo = {
  sexo: Sexo
  fechaNacimiento: string
  tallaCm: number
  pesoKg: number
  nivel: NivelActividad
  objetivo: TipoObjetivo
}

/** Todo el cálculo de una vez: edad, metabolismo basal, gasto y metas. */
export function calcularPlan(d: DatosCuerpo, hoy: string) {
  const edad = calcularEdad(d.fechaNacimiento, hoy)
  const tmb = metabolismoBasal({ sexo: d.sexo, pesoKg: d.pesoKg, tallaCm: d.tallaCm, edad })
  const gasto = gastoDiario(tmb, d.nivel)
  return {
    edad,
    tmb: Math.round(tmb),
    gasto: Math.round(gasto),
    metas: calcularMetas(gasto, d.pesoKg, d.objetivo),
  }
}

// ---------------------------------------------------------------------
// Actividad física: calorías estimadas con METs
// kcal = MET × peso (kg) × horas
// ---------------------------------------------------------------------
export type Intensidad = 'baja' | 'moderada' | 'alta'
export const MET: Record<Intensidad, number> = { baja: 3.5, moderada: 5, alta: 8 }

export function caloriasActividad(pesoKg: number, minutos: number, intensidad: Intensidad): number {
  return Math.round(MET[intensidad] * pesoKg * (minutos / 60))
}
