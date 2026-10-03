import type { ApiMethod, Bridge, TaskInput } from '@shared/api'
import type { AppData, Habit, MailAnalysis, MailMessage, Settings, Snapshot, Task } from '@shared/types'
import { addDays, toDateKey } from '@shared/dates'
import { toggleHabit } from '@shared/habits'
import { newTask, updateTask } from '@shared/tasks'

// Modo demostración: se activa solo al abrir la interfaz fuera de Electron
// (por ejemplo, en un navegador). Usa datos de ejemplo en memoria.

function demoData(): AppData {
  const now = new Date()
  const today = toDateKey(now)
  const iso = (daysAgo: number, h = 10) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }

  const habits: Habit[] = [
    { id: 'h1', name: 'Leer 20 minutos', emoji: '📚', startDate: addDays(today, -60), endDate: null, order: 0 },
    { id: 'h2', name: 'Hacer ejercicio', emoji: '🏃', startDate: addDays(today, -60), endDate: null, order: 1 },
    { id: 'h3', name: 'Tomar 2 L de agua', emoji: '💧', startDate: addDays(today, -60), endDate: null, order: 2 },
    { id: 'h4', name: 'Dormir antes de las 12', emoji: '🛏️', startDate: addDays(today, -60), endDate: null, order: 3 }
  ]
  const habitLog: AppData['habitLog'] = {}
  let seed = 7
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 1; i <= 45; i++) {
    const d = addDays(today, -i)
    const weekend = [0, 6].includes(new Date(`${d}T12:00`).getDay())
    const done = habits.filter((_h, idx) => rnd() < (weekend ? 0.45 : 0.85) - idx * 0.08).map((h) => h.id)
    if (done.length) habitLog[d] = done
  }
  habitLog[today] = ['h1', 'h3']

  const t = (p: Partial<Task> & { title: string }, id: string) => newTask(p, now, id)
  const tasks: Task[] = [
    t({ title: 'Enviar el informe de prácticas al profesor', area: 'estudio', priority: 'alta', dueDate: today, remindAt: iso(0, 18), email: { accountId: 'a1', to: 'docente@ucbvirtual.edu.pe', subject: 'Informe de prácticas', body: '' } }, 't1'),
    t({ title: 'Responder a la municipalidad sobre la denuncia', area: 'tramite', priority: 'alta', dueDate: addDays(today, -1), email: { accountId: 'a2', to: 'mesadepartes@muni.gob.pe', subject: 'Re: Expediente 2026-1234', body: '' } }, 't2'),
    t({ title: 'Estudiar para el examen de Estadística', area: 'estudio', dueDate: addDays(today, 2) }, 't3'),
    t({ title: 'Preparar la propuesta para el cliente', area: 'trabajo', priority: 'media', dueDate: addDays(today, 4) }, 't4'),
    t({ title: 'Renovar el DNI', area: 'tramite', priority: 'baja' }, 't5'),
    { ...t({ title: 'Pagar la pensión de la universidad', area: 'estudio', status: 'hecha' }, 't6') }
  ]

  const msg = (id: string, from: string, fromEmail: string, subject: string, snippet: string, hoursAgo: number, labels: string[] = ['UNREAD']): MailMessage => ({
    id, threadId: id, from, fromEmail, subject, snippet, date: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), unread: labels.includes('UNREAD'), labels, link: 'https://mail.google.com/'
  })
  const an = (id: string, a: Partial<MailAnalysis>): MailAnalysis => ({
    id, category: 'otro', importance: 'baja', needsAction: false, action: '', deadline: null, summary: '', source: 'ia', ...a
  })

  const m1 = [
    msg('m1', 'Mesa de Partes – Municipalidad', 'mesadepartes@muni.gob.pe', 'Notificación: Expediente 2026-1234', 'Se le notifica que tiene un plazo de 5 días hábiles para presentar…', 3),
    msg('m2', 'Reclutamiento Andina SAC', 'rrhh@andina.com.pe', 'Entrevista – confirmación de horario', 'Hola, ¿podrías confirmar si el jueves a las 10:00…', 20),
    msg('m3', 'Rappi', 'promo@rappi.com', '¡50% de descuento hoy!', 'Aprovecha las ofertas…', 6, ['UNREAD', 'CATEGORY_PROMOTIONS']),
    msg('m4', 'BCP', 'notificaciones@bcp.com.pe', 'Constancia de transferencia', 'Realizaste una transferencia de S/ 120.00…', 30, [])
  ]
  const m2 = [
    msg('u1', 'Prof. Rosa Díaz', 'rdiaz@ucbvirtual.edu.pe', 'Entrega del trabajo final – Estadística', 'Les recuerdo que el trabajo final se entrega el viernes…', 5),
    msg('u2', 'Aula Virtual UCB', 'noreply@ucbvirtual.edu.pe', 'Nueva calificación publicada', 'Se publicó la nota de la Práctica 2…', 26, [])
  ]

  return {
    version: 1,
    accounts: [
      { id: 'a1', provider: 'microsoft', email: 'usuario@ucbvirtual.edu.pe', label: 'Estudios', color: '#6366f1', connected: true, createdAt: iso(10) },
      { id: 'a2', provider: 'google', email: 'trabajo@gmail.com', label: 'Trabajo', color: '#10b981', connected: true, createdAt: iso(10) },
      { id: 'a3', provider: 'google', email: 'juegos@gmail.com', label: 'Juegos', color: '#f59e0b', connected: false, createdAt: iso(10) }
    ],
    activeAccountId: 'a2',
    tasks,
    habits,
    habitLog,
    reflections: [],
    mail: {
      a2: {
        accountId: 'a2', fetchedAt: iso(0, now.getHours()), unreadCount: 3, messages: m1,
        analysis: {
          m1: an('m1', { category: 'estatal', importance: 'alta', needsAction: true, action: 'Presentar el descargo del expediente en 5 días hábiles', deadline: addDays(today, 6), summary: 'La municipalidad notifica un expediente y da 5 días hábiles para responder.' }),
          m2: an('m2', { category: 'laboral', importance: 'alta', needsAction: true, action: 'Confirmar el horario de la entrevista del jueves', summary: 'Piden confirmar la entrevista del jueves a las 10:00.' }),
          m3: an('m3', { category: 'promocion', summary: 'Publicidad de descuentos.' }),
          m4: an('m4', { category: 'finanzas', importance: 'media', summary: 'Constancia de una transferencia de S/ 120.' })
        }
      },
      a1: {
        accountId: 'a1', fetchedAt: iso(0, now.getHours()), unreadCount: 1, messages: m2,
        analysis: {
          u1: an('u1', { category: 'educativo', importance: 'alta', needsAction: true, action: 'Entregar el trabajo final de Estadística', deadline: addDays(today, 3), summary: 'La profesora recuerda la entrega del trabajo final el viernes.' }),
          u2: an('u2', { category: 'educativo', importance: 'media', summary: 'Se publicó la nota de la Práctica 2.' })
        }
      }
    },
    calendar: {
      a1: { accountId: 'a1', fetchedAt: iso(0), events: [{ id: 'e1', title: 'Clase de Estadística', start: new Date(now.getTime() + 3 * 3_600_000).toISOString(), end: new Date(now.getTime() + 5 * 3_600_000).toISOString(), allDay: false, location: 'Aula virtual', link: '' }] },
      a2: { accountId: 'a2', fetchedAt: iso(0), events: [{ id: 'e2', title: 'Entrevista Andina SAC', start: new Date(now.getTime() + 50 * 3_600_000).toISOString(), end: new Date(now.getTime() + 51 * 3_600_000).toISOString(), allDay: false, location: '', link: '' }] }
    },
    settings: {
      googleClientId: '', microsoftClientId: '', microsoftTenant: 'common', aiEnabled: true, aiProvider: 'gemini', aiModel: 'claude-opus-5-5', geminiModel: 'gemini-2.5-flash',
      desktopNotifications: true, phoneNotifications: false, ntfyServer: 'https://ntfy.sh', ntfyTopic: 'cdm-demo1234abcd', launchAtStartup: true,
      closeToTray: true, mailRefreshMinutes: 15, dailyDigestTime: '08:00', habitReminderTime: '21:00', notionEnabled: false, notionDatabaseId: '',
      backgroundMessaging: false, theme: 'sistema'
    },
    notified: {},
    notionLastSync: null,
    notionLastError: null,
    notionPendingArchive: []
  }
}

export function installMockBridge(): void {
  let data = demoData()
  const badges: Record<string, number> = { 'whatsapp|persist:svc-whatsapp': 4 }
  const listeners = new Set<(s: Snapshot) => void>()
  const snapshot = (): Snapshot => ({
    data,
    secrets: { anthropicApiKey: false, geminiApiKey: true, googleClientSecret: false, notionToken: false, encryptionAvailable: true },
    badges,
    busy: []
  })
  const emit = () => listeners.forEach((l) => l(snapshot()))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Handler = (...args: any[]) => unknown
  const handlers: Partial<Record<ApiMethod, Handler>> = {
    getSnapshot: () => snapshot(),
    toggleHabit: ((date: string, id: string) => {
      data = { ...data, habitLog: toggleHabit(data.habitLog, date, id) }
    }),
    saveTask: ((input: TaskInput) => {
      const existing = data.tasks.find((t) => t.id === input.id)
      const task = existing ? updateTask(existing, input, new Date()) : newTask(input, new Date(), String(Date.now()))
      data = { ...data, tasks: existing ? data.tasks.map((t) => (t.id === task.id ? task : t)) : [...data.tasks, task] }
      return task
    }),
    deleteTask: ((id: string) => {
      data = { ...data, tasks: data.tasks.filter((t) => t.id !== id) }
    }),
    setActiveAccount: ((id: string) => {
      data = { ...data, activeAccountId: id }
    }),
    updateSettings: ((changes: Partial<Settings>) => {
      data = { ...data, settings: { ...data.settings, ...changes } }
    }),
    setBadge: () => undefined,
    openExternal: ((url: string) => {
      window.open(url, '_blank')
    })
  }

  const bridge: Bridge = {
    invoke: async (method, args) => {
      const h = handlers[method]
      if (!h) return { ok: false, error: 'No disponible en el modo demostración.' }
      try {
        const value = await h(...args)
        emit()
        return { ok: true, value }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    onSnapshot: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    onNavigate: () => () => undefined
  }
  window.cdm = bridge
}
