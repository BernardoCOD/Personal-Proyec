// Utilidades de fecha en hora local. Las fechas de calendario se guardan como YYYY-MM-DD.

const pad = (n: number): string => String(n).padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toDateKey(parseDateKey(value)) === value
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

export function daysInMonth(year: number, month: number): number {
  // month: 1-12
  return new Date(year, month, 0).getDate()
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`
}

export function monthDays(year: number, month: number): string[] {
  const n = daysInMonth(year, month)
  return Array.from({ length: n }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`)
}

/** 0 = lunes ... 6 = domingo (semana que empieza en lunes). */
export function weekdayMonFirst(key: string): number {
  return (parseDateKey(key).getDay() + 6) % 7
}

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

/** "HH:MM" -> minutos desde medianoche, o null si no es válido. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}
