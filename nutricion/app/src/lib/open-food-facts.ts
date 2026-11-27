// Productos envasados desde Open Food Facts (base abierta, licencia ODbL).
// https://openfoodfacts.github.io/openfoodfacts-server/api/

export type ProductoEtiqueta = {
  codigo: string
  nombre: string
  marca: string | null
  /** Valores por 100 g (o 100 ml). null = la etiqueta no lo trae. */
  calorias: number | null
  proteina_g: number | null
  carbohidratos_g: number | null
  grasa_g: number | null
  fibra_g: number | null
  /** Gramos de una porción según la etiqueta, si la trae. */
  porcionGramos: number | null
  imagen: string | null
}

export const CAMPOS_OFF = 'product_name,product_name_es,generic_name_es,brands,nutriments,serving_quantity,image_front_small_url'

export function esCodigoBarras(s: string) {
  return /^\d{6,14}$/.test(s)
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/** Convierte la respuesta de la API v2 en un producto, o null si no existe. */
export function productoDesdeOFF(codigo: string, respuesta: unknown): ProductoEtiqueta | null {
  const r = respuesta as { status?: number; product?: Record<string, unknown> } | null
  if (!r || r.status !== 1 || !r.product) return null
  const p = r.product
  const n = (p.nutriments ?? {}) as Record<string, unknown>
  let kcal = numero(n['energy-kcal_100g'])
  if (kcal === null) {
    const kj = numero(n['energy-kj_100g']) ?? numero(n['energy_100g'])
    kcal = kj === null ? null : Math.round((kj / 4.184) * 10) / 10
  }
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const nombre = texto(p.product_name_es) ?? texto(p.product_name) ?? texto(p.generic_name_es) ?? `Producto ${codigo}`
  const marca = texto(p.brands)?.split(',')[0].trim() ?? null
  const porcion = numero(p.serving_quantity)
  return {
    codigo,
    nombre: nombre.slice(0, 150),
    marca: marca?.slice(0, 80) ?? null,
    calorias: kcal,
    proteina_g: numero(n.proteins_100g),
    carbohidratos_g: numero(n.carbohydrates_100g),
    grasa_g: numero(n.fat_100g),
    fibra_g: numero(n.fiber_100g),
    porcionGramos: porcion && porcion > 0 && porcion < 5000 ? porcion : null,
    imagen: texto(p.image_front_small_url),
  }
}
