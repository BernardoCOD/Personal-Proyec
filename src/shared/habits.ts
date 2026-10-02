import type { Habit, HabitLog } from './types'
import { monthDays, weekdayMonFirst, WEEKDAYS } from './dates'

/**
 * Nivel de cumplimiento de un día. Con 4 hábitos:
 * 4/4 perfecto (verde), 3/4 alto, 2/4 medio, 1/4 bajo, 0/4 nulo (rojo).
 */
export type DayLevel = 'perfecto' | 'alto' | 'medio' | 'bajo' | 'nulo' | 'sin_habitos' | 'futuro'

export interface DayScore {
  date: string
  done: number
  total: number
  level: DayLevel
}

export function habitActiveOn(h: Habit, date: string): boolean {
  return h.startDate <= date && (h.endDate === null || date <= h.endDate)
}

export function activeHabitsOn(habits: Habit[], date: string): Habit[] {
  return habits.filter((h) => habitActiveOn(h, date)).sort((a, b) => a.order - b.order)
}

export function levelFor(done: number, total: number): DayLevel {
  if (total === 0) return 'sin_habitos'
  if (done >= total) return 'perfecto'
  if (done === 0) return 'nulo'
  const ratio = done / total
  if (ratio >= 0.7) return 'alto'
  if (ratio >= 0.4) return 'medio'
  return 'bajo'
}

export function scoreDay(habits: Habit[], log: HabitLog, date: string, today: string): DayScore {
  const active = activeHabitsOn(habits, date)
  const doneIds = new Set(log[date] ?? [])
  const done = active.filter((h) => doneIds.has(h.id)).length
  if (date > today) return { date, done, total: active.length, level: 'futuro' }
  return { date, done, total: active.length, level: levelFor(done, active.length) }
}

/** Marca o desmarca un hábito. Devuelve un registro nuevo (no muta el original). */
export function toggleHabit(log: HabitLog, date: string, habitId: string): HabitLog {
  const current = new Set(log[date] ?? [])
  if (current.has(habitId)) current.delete(habitId)
  else current.add(habitId)
  const next = { ...log }
  if (current.size === 0) delete next[date]
  else next[date] = [...current].sort()
  return next
}

export interface HabitMonthStat {
  habitId: string
  name: string
  emoji: string
  done: number
  possible: number
  rate: number
  longestStreak: number
  missedDates: string[]
}

export interface WeekdayStat {
  weekday: number
  name: string
  done: number
  possible: number
  rate: number
}

export interface MonthStats {
  month: string
  days: DayScore[]
  /** Días ya transcurridos con al menos un hábito activo. */
  countedDays: number
  overallRate: number
  perfectDays: number
  zeroDays: number
  longestPerfectStreak: number
  perHabit: HabitMonthStat[]
  perWeekday: WeekdayStat[]
  strongestHabit: HabitMonthStat | null
  weakestHabit: HabitMonthStat | null
  bestWeekday: WeekdayStat | null
  worstWeekday: WeekdayStat | null
  /** Cumplimiento por semana del mes (1-5). */
  perWeek: { week: number; rate: number; possible: number }[]
}

const rate = (done: number, possible: number): number => (possible === 0 ? 0 : done / possible)

export function monthStats(
  habits: Habit[],
  log: HabitLog,
  year: number,
  month: number,
  today: string
): MonthStats {
  const allDays = monthDays(year, month)
  const days = allDays.map((d) => scoreDay(habits, log, d, today))
  const counted = days.filter((d) => d.level !== 'futuro' && d.level !== 'sin_habitos')

  const totalDone = counted.reduce((s, d) => s + d.done, 0)
  const totalPossible = counted.reduce((s, d) => s + d.total, 0)

  let longestPerfectStreak = 0
  let run = 0
  for (const d of days) {
    if (d.level === 'perfecto') {
      run += 1
      longestPerfectStreak = Math.max(longestPerfectStreak, run)
    } else if (d.level !== 'sin_habitos') {
      run = 0
    }
  }

  const relevantHabits = habits
    .filter((h) => counted.some((d) => habitActiveOn(h, d.date)))
    .sort((a, b) => a.order - b.order)

  const perHabit: HabitMonthStat[] = relevantHabits.map((h) => {
    let done = 0
    let possible = 0
    let streak = 0
    let longest = 0
    const missedDates: string[] = []
    for (const d of counted) {
      if (!habitActiveOn(h, d.date)) continue
      possible += 1
      if ((log[d.date] ?? []).includes(h.id)) {
        done += 1
        streak += 1
        longest = Math.max(longest, streak)
      } else {
        streak = 0
        missedDates.push(d.date)
      }
    }
    return {
      habitId: h.id,
      name: h.name,
      emoji: h.emoji,
      done,
      possible,
      rate: rate(done, possible),
      longestStreak: longest,
      missedDates
    }
  })

  const perWeekday: WeekdayStat[] = WEEKDAYS.map((name, weekday) => {
    const ds = counted.filter((d) => weekdayMonFirst(d.date) === weekday)
    const done = ds.reduce((s, d) => s + d.done, 0)
    const possible = ds.reduce((s, d) => s + d.total, 0)
    return { weekday, name, done, possible, rate: rate(done, possible) }
  })

  const perWeek: MonthStats['perWeek'] = []
  for (let w = 0; w < 5; w++) {
    const ds = counted.filter((d) => {
      const dayNum = Number(d.date.slice(8, 10))
      return Math.min(4, Math.floor((dayNum - 1) / 7)) === w
    })
    const possible = ds.reduce((s, d) => s + d.total, 0)
    if (possible > 0) {
      perWeek.push({ week: w + 1, rate: rate(ds.reduce((s, d) => s + d.done, 0), possible), possible })
    }
  }

  const withData = perHabit.filter((h) => h.possible > 0)
  const strongestHabit = pickBy(withData, (a, b) => b.rate - a.rate || b.longestStreak - a.longestStreak)
  const weakestHabit = pickBy(withData, (a, b) => a.rate - b.rate || a.longestStreak - b.longestStreak)
  const weekdaysWithData = perWeekday.filter((w) => w.possible > 0)
  const bestWeekday = pickBy(weekdaysWithData, (a, b) => b.rate - a.rate)
  const worstWeekday = pickBy(weekdaysWithData, (a, b) => a.rate - b.rate)

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    days,
    countedDays: counted.length,
    overallRate: rate(totalDone, totalPossible),
    perfectDays: counted.filter((d) => d.level === 'perfecto').length,
    zeroDays: counted.filter((d) => d.level === 'nulo').length,
    longestPerfectStreak,
    perHabit,
    perWeekday,
    strongestHabit,
    weakestHabit: withData.length > 1 ? weakestHabit : null,
    bestWeekday,
    worstWeekday: weekdaysWithData.length > 1 ? worstWeekday : null,
    perWeek
  }
}

function pickBy<T>(items: T[], cmp: (a: T, b: T) => number): T | null {
  if (items.length === 0) return null
  return [...items].sort(cmp)[0]
}

export const LEVEL_LABEL: Record<DayLevel, string> = {
  perfecto: 'Todos cumplidos',
  alto: 'Casi todos',
  medio: 'La mitad',
  bajo: 'Pocos',
  nulo: 'Ninguno',
  sin_habitos: 'Sin hábitos',
  futuro: 'Próximo'
}
