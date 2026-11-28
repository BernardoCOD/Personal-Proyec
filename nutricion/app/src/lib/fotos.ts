// Fotos de progreso: reglas puras (sin base de datos), con pruebas.

import { sumarDias } from './fechas'

/** Bucket privado de Supabase Storage (ver migración de fotos). */
export const BUCKET_FOTOS = 'fotos-progreso'

export const VISTAS = [
  { valor: 'frente', nombre: 'Frente' },
  { valor: 'perfil', nombre: 'Perfil' },
  { valor: 'espalda', nombre: 'Espalda' },
] as const
export type Vista = (typeof VISTAS)[number]['valor']

/** Cada cuántos días se sugiere una nueva foto. */
export const DIAS_ENTRE_FOTOS = 28
/** Menos de esto entre dos fotos, los cambios casi no se notan. */
export const DIAS_MINIMOS_COMPARAR = 28

export type FotoInfo = { id: string; fecha: string; vista: Vista; peso_kg: number | null }

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)
}

/** Próxima foto sugerida: 4 semanas después de la última (o hoy si no hay ninguna). */
export function proximaFoto(fotos: Pick<FotoInfo, 'fecha'>[], hoy: string): { fecha: string; toca: boolean; diasFaltan: number } {
  if (fotos.length === 0) return { fecha: hoy, toca: true, diasFaltan: 0 }
  const ultima = fotos.reduce((m, f) => (f.fecha > m ? f.fecha : m), fotos[0].fecha)
  const fecha = sumarDias(ultima, DIAS_ENTRE_FOTOS)
  const diasFaltan = Math.max(0, diasEntre(hoy, fecha))
  return { fecha, toca: fecha <= hoy, diasFaltan }
}

/** Par por defecto para comparar: la primera y la última foto de la vista que más fotos tiene. */
export function parInicial(fotos: FotoInfo[]): { antes: FotoInfo; despues: FotoInfo } | null {
  const porVista = new Map<string, FotoInfo[]>()
  for (const f of fotos) porVista.set(f.vista, [...(porVista.get(f.vista) ?? []), f])
  const lista = [...porVista.values()].filter((l) => l.length >= 2).sort((a, b) => b.length - a.length)[0]
  if (!lista) return null
  const orden = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { antes: orden[0], despues: orden[orden.length - 1] }
}

/** Texto para acompañar una comparación según el tiempo y el peso. */
export function mensajeComparacion(antes: FotoInfo, despues: FotoInfo): string {
  const dias = Math.abs(diasEntre(antes.fecha, despues.fecha))
  if (dias < 7) return 'Son fotos muy cercanas: en pocos días el cuerpo casi no cambia. Compara con una foto de hace 4 semanas o más.'
  if (dias < DIAS_MINIMOS_COMPARAR) return `Van ${dias} días. Los cambios se notan mejor desde las 4 semanas: sigue así y vuelve a comparar.`
  const semanas = Math.round(dias / 7)
  const peso = antes.peso_kg !== null && despues.peso_kg !== null ? despues.peso_kg - antes.peso_kg : null
  const textoPeso = peso === null ? '' : Math.abs(peso) < 0.5
    ? ' Tu peso casi no cambió: fíjate en la forma, la cintura y los músculos, que a veces cambian aunque la báscula no.'
    : ` Tu peso cambió ${peso > 0 ? '+' : ''}${peso.toFixed(1)} kg.`
  return `${semanas} semanas de constancia entre estas dos fotos.${textoPeso}`
}
