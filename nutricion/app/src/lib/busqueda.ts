// Entiende lo que se escribe en el buscador: "plátano frito 100g",
// "2 panes", "1 taza de arroz", "media palta"...
// Separa el alimento de la cantidad y la unidad.

import { esUnidadFija, type Porcion, type UnidadFija } from './unidades'

export type Busqueda = {
  /** Texto para buscar el alimento (sin la cantidad ni la unidad). */
  texto: string
  cantidad: number | null
  /** Unidad fija (g, kg, lb, oz, ml) o tipo de porción casera (taza, cucharada, unidad...). */
  unidad: string | null
}

// Palabra escrita -> unidad. Las fijas convierten a gramos; las otras buscan una porción.
const UNIDADES: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  lb: 'lb', lbs: 'lb', libra: 'lb', libras: 'lb',
  oz: 'oz', onza: 'oz', onzas: 'oz',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml', cc: 'ml',
  l: 'l', litro: 'l', litros: 'l',
  taza: 'taza', tazas: 'taza',
  vaso: 'vaso', vasos: 'vaso',
  cucharada: 'cucharada', cucharadas: 'cucharada', cda: 'cucharada', cdas: 'cucharada',
  cucharadita: 'cucharadita', cucharaditas: 'cucharadita', cdta: 'cucharadita', cdtas: 'cucharadita',
  unidad: 'unidad', unidades: 'unidad', und: 'unidad', unds: 'unidad', u: 'unidad',
  tajada: 'tajada', tajadas: 'tajada', rebanada: 'tajada', rebanadas: 'tajada',
  filete: 'filete', filetes: 'filete',
  pierna: 'pierna', piernas: 'pierna',
  trozo: 'trozo', trozos: 'trozo', presa: 'trozo', presas: 'trozo',
  porcion: 'porción', porciones: 'porción', plato: 'porción', platos: 'porción',
}

const PALABRAS_NUMERO: Record<string, number> = {
  un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, cuarto: 0.25,
}

const RELLENO = new Set(['de', 'del', 'con', 'y', 'el', 'la', 'los', 'las', 'en'])

function sinTildes(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function leerNumero(s: string): number | null {
  const f = s.match(/^(\d+)\/(\d+)$/)
  if (f) return Number(f[2]) > 0 ? Number(f[1]) / Number(f[2]) : null
  if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'))
  return PALABRAS_NUMERO[sinTildes(s)] ?? null
}

export function interpretarBusqueda(entrada: string): Busqueda {
  // Separa "100g" -> "100 g" y "1/2taza" -> "1/2 taza".
  const tokens = entrada.trim().replace(/(\d)([a-záéíóúñ]+)\b/gi, '$1 $2').split(/\s+/).filter(Boolean)
  let cantidad: number | null = null
  let unidad: string | null = null
  const resto: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const n: number | null = cantidad === null ? leerNumero(tokens[i]) : null
    // Un número escrito ("un", "media") solo cuenta si va al inicio o seguido de una unidad.
    const esPalabra = n !== null && !/\d/.test(tokens[i])
    const sig = tokens[i + 1] ? UNIDADES[sinTildes(tokens[i + 1])] : undefined
    if (n !== null && (!esPalabra || i === 0 || sig)) {
      cantidad = n
      if (sig) {
        unidad = sig
        i++
      }
      continue
    }
    const u: string | undefined = unidad === null && cantidad !== null && resto.length === 0 ? UNIDADES[sinTildes(tokens[i])] : undefined
    if (u) {
      unidad = u
      continue
    }
    resto.push(tokens[i])
  }

  if (unidad === 'l' && cantidad !== null) {
    cantidad *= 1000
    unidad = 'ml'
  }
  // Quita "de", "con"... sueltos al principio o al final ("100 g de arroz").
  while (resto.length && RELLENO.has(sinTildes(resto[0]))) resto.shift()
  while (resto.length && RELLENO.has(sinTildes(resto[resto.length - 1]))) resto.pop()

  return { texto: resto.join(' '), cantidad, unidad }
}

/**
 * Cantidad y unidad para agregar un alimento según lo interpretado.
 * Sin datos: 1 porción (la primera) o 100 g.
 */
export function cantidadInicial(b: Pick<Busqueda, 'cantidad' | 'unidad'>, porciones: Porcion[]): { cantidad: number; unidad: string } {
  const porDefecto = porciones[0] ? { cantidad: 1, unidad: porciones[0].nombre } : { cantidad: 100, unidad: 'g' }
  const { cantidad, unidad } = b
  if (unidad && esUnidadFija(unidad)) return { cantidad: cantidad ?? 100, unidad: unidad as UnidadFija }
  if (unidad) {
    // Porción casera: la que se llama igual, o "unidad mediana" si se pidió "unidad".
    const candidatas = porciones.filter((p) => sinTildes(p.nombre).startsWith(sinTildes(unidad)))
    const p = candidatas.find((x) => x.nombre === unidad) ?? candidatas.find((x) => x.nombre.includes('mediana')) ?? candidatas[0]
    if (p) return { cantidad: cantidad ?? 1, unidad: p.nombre }
    return porDefecto.unidad === 'g' ? porDefecto : { cantidad: cantidad ?? 1, unidad: porDefecto.unidad }
  }
  if (cantidad !== null) {
    // Solo un número: "2 panes" = 2 porciones; "150 arroz" = 150 g.
    if (porciones[0] && cantidad < 20) return { cantidad, unidad: porciones[0].nombre }
    return { cantidad, unidad: 'g' }
  }
  return porDefecto
}
