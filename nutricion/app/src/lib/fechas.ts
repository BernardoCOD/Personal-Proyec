// Fechas en la zona horaria del usuario (por defecto, Lima).

export const ZONA_POR_DEFECTO = 'America/Lima'

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

export function esFechaValida(s: unknown): s is string {
  if (typeof s !== 'string' || !RE_FECHA.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** 'AAAA-MM-DD' de un instante en la zona indicada. */
export function fechaEnZona(instante: Date, zona = ZONA_POR_DEFECTO): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante)
}

/** Diferencia con UTC de la zona en un instante, como '-05:00'. */
export function desfaseZona(instante: Date, zona = ZONA_POR_DEFECTO): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(instante)
  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = nombre.match(/GMT([+-]\d{2}:\d{2})/)
  return m ? m[1] : '+00:00'
}

/** Inicio (incluido) y fin (excluido) de un día local, en ISO UTC. */
export function rangoDelDia(fecha: string, zona = ZONA_POR_DEFECTO): { desde: string; hasta: string } {
  const desde = new Date(`${fecha}T00:00:00${desfaseZona(new Date(`${fecha}T12:00:00Z`), zona)}`)
  const siguiente = sumarDias(fecha, 1)
  const hasta = new Date(`${siguiente}T00:00:00${desfaseZona(new Date(`${siguiente}T12:00:00Z`), zona)}`)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** "martes 25 de noviembre" */
export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`))
}

/** "25 nov" */
export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace('.', '')
}

/** "1:05 p. m." en la zona del usuario. */
export function horaEnZona(iso: string, zona = ZONA_POR_DEFECTO): string {
  return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(iso))
}

/** Lunes (AAAA-MM-DD) de la semana de una fecha. */
export function lunesDeLaSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  const dia = (d.getUTCDay() + 6) % 7 // lunes = 0
  return sumarDias(fecha, -dia)
}
