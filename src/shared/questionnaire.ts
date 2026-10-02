import type { QuestionAnswer, ReflectionAnalysis } from './types'
import type { MonthStats } from './habits'

export type QuestionKind = 'escala' | 'texto' | 'opciones'

export interface Question {
  id: string
  text: string
  kind: QuestionKind
  options?: string[]
  hint?: string
}

const pct = (r: number): string => `${Math.round(r * 100)}%`

export const OBSTACLES = [
  'Falta de tiempo',
  'Cansancio o poca energía',
  'Me olvidé',
  'Poca motivación',
  'Imprevistos o compromisos',
  'Estrés o ánimo bajo',
  'Dormí mal o tarde',
  'Uso del celular / redes',
  'El hábito es muy difícil o largo',
  'No tenía un horario fijo'
]

/** Preguntas del cuestionario mensual, adaptadas a los datos del mes. */
export function buildQuestions(stats: MonthStats): Question[] {
  const q: Question[] = []

  if (stats.weakestHabit && stats.weakestHabit.rate < 1) {
    q.push({
      id: 'habito_debil',
      kind: 'texto',
      text: `Tu hábito más difícil fue "${stats.weakestHabit.name}" (${pct(stats.weakestHabit.rate)}). ¿Qué te impidió hacerlo los días que fallaste?`
    })
  }
  if (stats.worstWeekday && stats.bestWeekday && stats.worstWeekday.rate < stats.bestWeekday.rate) {
    q.push({
      id: 'dia_debil',
      kind: 'texto',
      text: `Los ${stats.worstWeekday.name.toLowerCase()} cumpliste menos (${pct(stats.worstWeekday.rate)}) que los ${stats.bestWeekday.name.toLowerCase()} (${pct(stats.bestWeekday.rate)}). ¿Qué suele pasar ese día?`
    })
  }
  if (stats.perfectDays > 0) {
    q.push({
      id: 'dias_perfectos',
      kind: 'texto',
      text: `Tuviste ${stats.perfectDays} día(s) con todos los hábitos cumplidos. ¿Qué hiciste distinto esos días?`
    })
  }
  if (stats.perWeek.length >= 2) {
    const first = stats.perWeek[0]
    const last = stats.perWeek[stats.perWeek.length - 1]
    if (last.rate + 0.15 < first.rate) {
      q.push({
        id: 'caida',
        kind: 'texto',
        text: `Empezaste el mes con ${pct(first.rate)} y terminaste con ${pct(last.rate)}. ¿Qué cambió en las últimas semanas?`
      })
    }
  }

  q.push(
    {
      id: 'obstaculos',
      kind: 'opciones',
      text: '¿Qué obstáculos aparecieron más este mes? (elige los que apliquen)',
      options: OBSTACLES
    },
    { id: 'energia', kind: 'escala', text: '¿Cómo estuvo tu energía en general?', hint: '1 = muy baja, 5 = muy alta' },
    { id: 'sueno', kind: 'escala', text: '¿Qué tan bien dormiste?', hint: '1 = muy mal, 5 = muy bien' },
    { id: 'estres', kind: 'escala', text: '¿Cuánto estrés tuviste (estudios, trabajo, trámites)?', hint: '1 = nada, 5 = muchísimo' },
    { id: 'motivacion', kind: 'escala', text: '¿Qué tan motivado te sentiste con tus hábitos?', hint: '1 = nada, 5 = mucho' },
    { id: 'horario', kind: 'escala', text: '¿Tenías una hora fija para cada hábito?', hint: '1 = nunca, 5 = siempre' },
    { id: 'cambiar', kind: 'texto', text: 'Si pudieras cambiar una sola cosa el próximo mes, ¿cuál sería?' }
  )
  return q
}

/** Análisis sin IA: reglas simples sobre las respuestas y las estadísticas. */
export function ruleBasedAnalysis(stats: MonthStats, answers: QuestionAnswer[]): ReflectionAnalysis {
  const get = (id: string): string => answers.find((a) => a.questionId === id)?.answer ?? ''
  const num = (id: string): number | null => {
    const n = Number(get(id))
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
  }

  const fortalezas: string[] = []
  if (stats.strongestHabit) {
    fortalezas.push(`"${stats.strongestHabit.name}" fue tu hábito más constante (${pct(stats.strongestHabit.rate)}, racha de ${stats.strongestHabit.longestStreak} días).`)
  }
  if (stats.bestWeekday && stats.bestWeekday.rate > 0) {
    fortalezas.push(`Los ${stats.bestWeekday.name.toLowerCase()} son tu mejor día (${pct(stats.bestWeekday.rate)}).`)
  }
  if (stats.longestPerfectStreak >= 2) {
    fortalezas.push(`Lograste ${stats.longestPerfectStreak} días seguidos con todo cumplido.`)
  }

  const obstaculos: ReflectionAnalysis['obstaculos'] = []
  for (const o of get('obstaculos').split(';').map((s) => s.trim()).filter(Boolean)) {
    obstaculos.push({ factor: o, evidencia: 'Lo marcaste en el cuestionario.' })
  }
  const sueno = num('sueno')
  const energia = num('energia')
  const estres = num('estres')
  const horario = num('horario')
  if (sueno !== null && sueno <= 2) obstaculos.push({ factor: 'Sueño', evidencia: `Calificaste tu sueño con ${sueno}/5.` })
  if (energia !== null && energia <= 2) obstaculos.push({ factor: 'Energía baja', evidencia: `Calificaste tu energía con ${energia}/5.` })
  if (estres !== null && estres >= 4) obstaculos.push({ factor: 'Estrés alto', evidencia: `Calificaste tu estrés con ${estres}/5.` })
  if (horario !== null && horario <= 2) obstaculos.push({ factor: 'Sin horario fijo', evidencia: `Calificaste tu horario con ${horario}/5.` })

  const patrones: string[] = []
  if (stats.worstWeekday) patrones.push(`Los ${stats.worstWeekday.name.toLowerCase()} bajas a ${pct(stats.worstWeekday.rate)}.`)
  if (stats.weakestHabit) patrones.push(`"${stats.weakestHabit.name}" se queda en ${pct(stats.weakestHabit.rate)}.`)
  if (stats.zeroDays > 0) patrones.push(`Hubo ${stats.zeroDays} día(s) sin ningún hábito.`)

  const recomendaciones: ReflectionAnalysis['recomendaciones'] = []
  if (horario !== null && horario <= 3) {
    recomendaciones.push({ accion: 'Asigna una hora fija a cada hábito y pon un recordatorio.', porque: 'Sin horario fijo es más fácil postergar.' })
  }
  if (stats.weakestHabit && stats.weakestHabit.rate < 0.5) {
    recomendaciones.push({ accion: `Reduce "${stats.weakestHabit.name}" a una versión mínima (5 minutos).`, porque: 'Una versión más pequeña es más fácil de sostener todos los días.' })
  }
  if (stats.worstWeekday && stats.worstWeekday.rate < 0.5) {
    recomendaciones.push({ accion: `Prepara los ${stats.worstWeekday.name.toLowerCase()} con anticipación (la noche anterior).`, porque: 'Es el día en que más fallas.' })
  }
  if (sueno !== null && sueno <= 2) {
    recomendaciones.push({ accion: 'Fija una hora para dormir y evita el celular 30 minutos antes.', porque: 'Dormir mal reduce la energía para cumplir.' })
  }
  if (recomendaciones.length === 0) {
    recomendaciones.push({ accion: 'Mantén lo que estás haciendo y sube un poco la meta.', porque: 'Tus resultados del mes son buenos.' })
  }

  return {
    resumen: `Cumpliste el ${pct(stats.overallRate)} de tus hábitos en ${stats.countedDays} días, con ${stats.perfectDays} día(s) perfectos y ${stats.zeroDays} día(s) en cero.`,
    fortalezas,
    obstaculos,
    patrones,
    recomendaciones,
    mensaje: stats.overallRate >= 0.8 ? '¡Gran mes! Lo importante ahora es no soltar la racha.' : 'Cada día cuenta. Ajusta lo que no funcionó y vuelve a intentarlo.',
    source: 'reglas'
  }
}
