import { describe, expect, it } from 'vitest'
import type { Habit, MailMessage, Task } from './types'
import { addDays, isDateKey, monthDays, parseTime, weekdayMonFirst } from './dates'
import { levelFor, monthStats, scoreDay, toggleHabit } from './habits'
import { buildQuestions, ruleBasedAnalysis } from './questionnaire'
import { composeUrl, dueReminders, groupTasks, newTask, reminderKey, updateTask } from './tasks'
import { categorize, ruleAnalysis, splitByAction } from './classify'
import { applyRemote, decideSync, fieldsOfTask, hashFields, pageToRemote, parseNotionId, taskToProperties } from './notionMap'

const habit = (id: string, order: number, startDate = '2026-01-01', endDate: string | null = null): Habit => ({
  id, name: `Hábito ${id}`, emoji: '✅', startDate, endDate, order
})

describe('fechas', () => {
  it('valida y suma días cruzando meses', () => {
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('semana empieza en lunes', () => {
    expect(weekdayMonFirst('2026-10-05')).toBe(0) // lunes
    expect(weekdayMonFirst('2026-10-04')).toBe(6) // domingo
  })
  it('lee horas HH:MM', () => {
    expect(parseTime('08:30')).toBe(510)
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('abc')).toBeNull()
  })
  it('lista los días del mes', () => {
    expect(monthDays(2026, 2)).toHaveLength(28)
  })
})

describe('hábitos', () => {
  const habits = [habit('a', 0), habit('b', 1), habit('c', 2), habit('d', 3)]

  it('asigna colores según cuántos hábitos se cumplieron (4 hábitos)', () => {
    expect(levelFor(4, 4)).toBe('perfecto')
    expect(levelFor(3, 4)).toBe('alto')
    expect(levelFor(2, 4)).toBe('medio')
    expect(levelFor(1, 4)).toBe('bajo')
    expect(levelFor(0, 4)).toBe('nulo')
    expect(levelFor(0, 0)).toBe('sin_habitos')
  })

  it('marca y desmarca sin mutar el registro', () => {
    const log = {}
    const l1 = toggleHabit(log, '2026-10-01', 'a')
    expect(l1).toEqual({ '2026-10-01': ['a'] })
    expect(log).toEqual({})
    expect(toggleHabit(l1, '2026-10-01', 'a')).toEqual({})
  })

  it('no cuenta días futuros ni hábitos que aún no existían', () => {
    const hs = [habit('a', 0), habit('nuevo', 1, '2026-10-10')]
    expect(scoreDay(hs, {}, '2026-10-05', '2026-10-20').total).toBe(1)
    expect(scoreDay(hs, {}, '2026-10-15', '2026-10-20').total).toBe(2)
    expect(scoreDay(hs, {}, '2026-10-25', '2026-10-20').level).toBe('futuro')
  })

  it('calcula estadísticas del mes', () => {
    const log = {
      '2026-10-01': ['a', 'b', 'c', 'd'], // jueves perfecto
      '2026-10-02': ['a', 'b', 'c', 'd'], // viernes perfecto
      '2026-10-03': ['a'], // sábado
      '2026-10-04': [] as string[] // domingo
    }
    const s = monthStats(habits, log, 2026, 10, '2026-10-04')
    expect(s.countedDays).toBe(4)
    expect(s.perfectDays).toBe(2)
    expect(s.zeroDays).toBe(1)
    expect(s.longestPerfectStreak).toBe(2)
    expect(s.overallRate).toBeCloseTo(9 / 16)
    expect(s.strongestHabit?.habitId).toBe('a')
    expect(s.weakestHabit?.rate).toBeCloseTo(0.5)
    expect(s.worstWeekday?.name).toBe('Domingo')
    expect(s.perHabit.find((h) => h.habitId === 'b')?.missedDates).toEqual(['2026-10-03', '2026-10-04'])
  })

  it('genera preguntas y un análisis por reglas', () => {
    const log = { '2026-10-01': ['a', 'b', 'c', 'd'], '2026-10-02': ['a'] }
    const s = monthStats(habits, log, 2026, 10, '2026-10-02')
    const qs = buildQuestions(s)
    expect(qs.some((q) => q.id === 'habito_debil')).toBe(true)
    expect(qs.some((q) => q.id === 'dias_perfectos')).toBe(true)
    const a = ruleBasedAnalysis(s, [
      { questionId: 'sueno', question: '', answer: '1' },
      { questionId: 'horario', question: '', answer: '2' },
      { questionId: 'obstaculos', question: '', answer: 'Me olvidé; Falta de tiempo' }
    ])
    expect(a.obstaculos.map((o) => o.factor)).toEqual(expect.arrayContaining(['Me olvidé', 'Falta de tiempo', 'Sueño', 'Sin horario fijo']))
    expect(a.recomendaciones.length).toBeGreaterThan(0)
  })
})

describe('tareas', () => {
  const now = new Date(2026, 9, 2, 10, 0)

  it('agrupa por vencidas, hoy, próximas, sin fecha y hechas', () => {
    const tasks = [
      newTask({ title: 'vencida', dueDate: '2026-10-01' }, now, '1'),
      newTask({ title: 'hoy', dueDate: '2026-10-02' }, now, '2'),
      newTask({ title: 'luego', dueDate: '2026-10-20' }, now, '3'),
      newTask({ title: 'sin fecha' }, now, '4'),
      newTask({ title: 'hecha', status: 'hecha' }, now, '5')
    ]
    const g = groupTasks(tasks, now)
    expect([g.overdue, g.today, g.upcoming, g.noDate, g.done].map((x) => x.map((t) => t.id))).toEqual([['1'], ['2'], ['3'], ['4'], ['5']])
  })

  it('completedAt sigue al estado', () => {
    const t = newTask({ title: 'x' }, now, '1')
    const done = updateTask(t, { status: 'hecha' }, now)
    expect(done.completedAt).not.toBeNull()
    expect(updateTask(done, { status: 'pendiente' }, now).completedAt).toBeNull()
  })

  it('recordatorios vencidos solo una vez, y otra vez si se reprograman', () => {
    const t = newTask({ title: 'enviar correo', remindAt: new Date(2026, 9, 2, 9, 0).toISOString() }, now, '1')
    expect(dueReminders([t], now, {})).toHaveLength(1)
    expect(dueReminders([t], now, { [reminderKey(t)]: 1 })).toHaveLength(0)
    const moved = updateTask(t, { remindAt: new Date(2026, 9, 2, 9, 30).toISOString() }, now)
    expect(dueReminders([moved], now, { [reminderKey(t)]: 1 })).toHaveLength(1)
    expect(dueReminders([updateTask(t, { status: 'hecha' }, now)], now, {})).toHaveLength(0)
  })

  it('arma enlaces para redactar correos', () => {
    const url = composeUrl('google', { to: 'a@b.com', subject: 'Hola ñandú', body: 'x' })
    expect(url).toContain('view=cm')
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain('Hola ñandú')
    expect(composeUrl('microsoft', { to: 'a@b.com', subject: 's', body: '' })).toContain('outlook.office.com')
  })
})

describe('clasificación de correos', () => {
  const mail = (fromEmail: string, subject: string, labels: string[] = [], snippet = ''): MailMessage => ({
    id: fromEmail + subject, threadId: 't', from: fromEmail, fromEmail, subject, snippet, date: '2026-10-02T10:00:00Z', unread: true, labels, link: ''
  })

  it('reconoce correos estatales, educativos y promociones', () => {
    expect(categorize(mail('notificaciones@sunat.gob.pe', 'Aviso'))).toBe('estatal')
    expect(categorize(mail('mesadepartes@munlima.gob.pe', 'Expediente'))).toBe('estatal')
    expect(categorize(mail('docente@ucbvirtual.edu.pe', 'Clase'))).toBe('educativo')
    expect(categorize(mail('ofertas@tienda.com', 'Descuento', ['CATEGORY_PROMOTIONS']))).toBe('promocion')
  })

  it('los estatales son importantes y requieren acción; las promociones no', () => {
    const e = ruleAnalysis(mail('x@pj.gob.pe', 'Notificación de denuncia'))
    expect(e.importance).toBe('alta')
    expect(e.needsAction).toBe(true)
    const p = ruleAnalysis(mail('promo@tienda.com', 'Urgente: oferta', ['CATEGORY_PROMOTIONS']))
    expect(p.needsAction).toBe(false)
    expect(p.importance).toBe('baja')
  })

  it('separa por hacer / sin acción', () => {
    const ms = [mail('x@pj.gob.pe', 'Citación'), mail('promo@t.com', 'Oferta', ['CATEGORY_PROMOTIONS'])]
    const { todo, rest } = splitByAction(ms, {})
    expect(todo).toHaveLength(1)
    expect(rest).toHaveLength(1)
  })
})

describe('sincronización con Notion', () => {
  const t0 = new Date('2026-10-02T10:00:00Z')
  const base = (): Task => {
    const t = newTask({ title: 'Enviar informe', email: { accountId: null, to: 'jefe@x.com', subject: 'Informe', body: '' } }, t0, 'local-1')
    return { ...t, notion: { pageId: 'p1', syncedAt: t0.toISOString(), hash: hashFields(fieldsOfTask(t)) } }
  }
  const page = (t: Task, edits: Record<string, unknown> = {}, edited = '2026-10-02T10:00:00.000Z') => ({
    id: 'p1', last_edited_time: edited, properties: { ...JSON.parse(JSON.stringify(taskToProperties(t))), ...edits }
  })
  // La API devuelve plain_text; lo agregamos a lo que nosotros enviamos.
  const withPlain = (p: ReturnType<typeof page>) => {
    for (const v of Object.values(p.properties) as { title?: { text: { content: string }; plain_text?: string }[]; rich_text?: { text: { content: string }; plain_text?: string }[] }[]) {
      for (const part of v.title ?? v.rich_text ?? []) part.plain_text = part.text.content
    }
    return p
  }

  it('ida y vuelta conserva los campos', () => {
    const t = base()
    const r = pageToRemote(withPlain(page(t)))
    expect(r?.localId).toBe('local-1')
    expect(r?.fields).toEqual(fieldsOfTask(t))
    expect(decideSync(t, r!)).toBe('none')
  })

  it('si solo cambió Notion (desde el celular), baja el cambio', () => {
    const t = base()
    const r = pageToRemote(withPlain(page(t, { Estado: { select: { name: 'Hecha' } } }, '2026-10-02T11:00:00.000Z')))!
    expect(decideSync(t, r)).toBe('pull')
    const merged = applyRemote(t, r, new Date('2026-10-02T11:01:00Z'))
    expect(merged.status).toBe('hecha')
    expect(merged.completedAt).not.toBeNull()
    expect(merged.email?.to).toBe('jefe@x.com')
  })

  it('si solo cambió la local, la sube', () => {
    const t = updateTask(base(), { title: 'Enviar informe final' }, new Date('2026-10-02T12:00:00Z'))
    const r = pageToRemote(withPlain(page(base())))!
    expect(decideSync(t, r)).toBe('push')
  })

  it('si cambiaron ambas, gana la más reciente', () => {
    const local = updateTask(base(), { title: 'Local' }, new Date('2026-10-02T12:00:00Z'))
    const older = pageToRemote(withPlain(page(base(), { Prioridad: { select: { name: 'Alta' } } }, '2026-10-02T11:00:00.000Z')))!
    const newer = pageToRemote(withPlain(page(base(), { Prioridad: { select: { name: 'Alta' } } }, '2026-10-02T13:00:00.000Z')))!
    expect(decideSync(local, older)).toBe('push')
    expect(decideSync(local, newer)).toBe('pull')
  })

  it('ignora páginas archivadas o sin título', () => {
    expect(pageToRemote({ id: 'x', last_edited_time: '', archived: true, properties: {} })).toBeNull()
    expect(pageToRemote({ id: 'x', last_edited_time: '', properties: {} })).toBeNull()
  })

  it('lee ids desde enlaces de Notion', () => {
    expect(parseNotionId('https://www.notion.so/Mis-tareas-0123456789abcdef0123456789abcdef?v=fff')).toBe('01234567-89ab-cdef-0123-456789abcdef')
    expect(parseNotionId('01234567-89ab-cdef-0123-456789abcdef')).toBe('01234567-89ab-cdef-0123-456789abcdef')
    expect(parseNotionId('no es un id')).toBeNull()
  })
})

describe('ventanas de inicio de sesión', () => {
  it('reconoce dominios y subdominios de inicio de sesión', async () => {
    const { isAuthHost } = await import('./services')
    expect(isAuthHost('accounts.google.com')).toBe(true)
    expect(isAuthHost('login.microsoftonline.com')).toBe(true)
    expect(isAuthHost('www.notion.so')).toBe(true)
    expect(isAuthHost('notion.so')).toBe(true)
    expect(isAuthHost('evilnotion.so')).toBe(false)
    expect(isAuthHost('example.com')).toBe(false)
  })
})
