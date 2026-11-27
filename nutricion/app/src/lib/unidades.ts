// Conversión de cantidades a gramos y cálculo de macros.

/** Unidades con equivalencia fija en gramos. */
export const UNIDADES_FIJAS = {
  g: { nombre: 'gramos (g)', gramos: 1 },
  kg: { nombre: 'kilos (kg)', gramos: 1000 },
  lb: { nombre: 'libras (lb)', gramos: 453.592 },
  oz: { nombre: 'onzas (oz)', gramos: 28.3495 },
  // Aproximación: 1 ml ≈ 1 g (válido para agua, gaseosas, leche...).
  ml: { nombre: 'mililitros (ml)', gramos: 1 },
} as const

export type UnidadFija = keyof typeof UNIDADES_FIJAS

export function esUnidadFija(u: string): u is UnidadFija {
  return Object.hasOwn(UNIDADES_FIJAS, u)
}

export type Porcion = { nombre: string; gramos: number }

/**
 * Gramos de una cantidad en una unidad fija (g, kg, lb, oz, ml) o en una
 * porción casera del alimento (taza, unidad...). Devuelve null si la unidad
 * no se conoce.
 */
export function aGramos(cantidad: number, unidad: string, porciones: Porcion[] = []): number | null {
  if (!(cantidad > 0)) return null
  if (esUnidadFija(unidad)) return redondear(cantidad * UNIDADES_FIJAS[unidad].gramos)
  const p = porciones.find((x) => x.nombre === unidad)
  return p ? redondear(cantidad * p.gramos) : null
}

export type ValoresPor100g = {
  calorias: number
  proteina_g: number
  carbohidratos_g: number
  grasa_g: number
  fibra_g: number
}

/** Macros de una cantidad en gramos a partir de los valores por 100 g. */
export function macrosDeGramos(v: ValoresPor100g, gramos: number): ValoresPor100g {
  const f = gramos / 100
  return {
    calorias: redondear(v.calorias * f),
    proteina_g: redondear(v.proteina_g * f),
    carbohidratos_g: redondear(v.carbohidratos_g * f),
    grasa_g: redondear(v.grasa_g * f),
    fibra_g: redondear(v.fibra_g * f),
  }
}

/** Lo contrario: valores por 100 g a partir de los totales de una cantidad. */
export function por100gDeTotales(v: ValoresPor100g, gramos: number): ValoresPor100g {
  return macrosDeGramos(v, (100 * 100) / gramos)
}

export function redondear(n: number, decimales = 2): number {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}
