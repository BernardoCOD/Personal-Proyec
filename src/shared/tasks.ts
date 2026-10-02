import type { Task, TaskArea, Priority, TaskStatus } from './types'
import { toDateKey } from './dates'

export const AREA_LABEL: Record<TaskArea, string> = {
  estudio: 'Estudio',
  trabajo: 'Trabajo',
  personal: 'Personal',
  tramite: 'Trámite / Estatal'
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  hecha: 'Hecha'
}

export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baja: 2 }

export function newTask(partial: Partial<Task> & { title: string }, now: Date, id: string): Task {
  const iso = now.toISOString()
  return {
    id,
    title: partial.title.trim(),
    notes: partial.notes ?? '',
    area: partial.area ?? 'personal',
    priority: partial.priority ?? 'media',
    status: partial.status ?? 'pendiente',
    dueDate: partial.dueDate ?? null,
    remindAt: partial.remindAt ?? null,
    email: partial.email ?? null,
    source: partial.source ?? null,
    createdAt: iso,
    updatedAt: iso,
    completedAt: partial.status === 'hecha' ? iso : null,
    notion: partial.notion ?? null
  }
}

/** Aplica cambios a una tarea manteniendo coherentes updatedAt y completedAt. */
export function updateTask(task: Task, changes: Partial<Task>, now: Date): Task {
  const next: Task = { ...task, ...changes, id: task.id, createdAt: task.createdAt, updatedAt: now.toISOString() }
  if (next.status === 'hecha' && task.status !== 'hecha') next.completedAt = now.toISOString()
  if (next.status !== 'hecha') next.completedAt = null
  return next
}

export function isOpen(t: Task): boolean {
  return t.status !== 'hecha'
}

export function isOverdue(t: Task, today: string): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1
    const da = a.dueDate ?? '9999-12-31'
    const db = b.dueDate ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    if (a.priority !== b.priority) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    return a.createdAt < b.createdAt ? -1 : 1
  })
}

export interface TaskGroups {
  overdue: Task[]
  today: Task[]
  upcoming: Task[]
  noDate: Task[]
  done: Task[]
}

export function groupTasks(tasks: Task[], now: Date): TaskGroups {
  const today = toDateKey(now)
  const g: TaskGroups = { overdue: [], today: [], upcoming: [], noDate: [], done: [] }
  for (const t of sortTasks(tasks)) {
    if (!isOpen(t)) g.done.push(t)
    else if (t.dueDate === null) g.noDate.push(t)
    else if (t.dueDate < today) g.overdue.push(t)
    else if (t.dueDate === today) g.today.push(t)
    else g.upcoming.push(t)
  }
  return g
}

/** Tareas abiertas cuyo recordatorio ya venció y aún no se notificaron. */
export function dueReminders(tasks: Task[], now: Date, notified: Record<string, number>): Task[] {
  return tasks.filter(
    (t) => isOpen(t) && t.remindAt !== null && new Date(t.remindAt).getTime() <= now.getTime() && !notified[reminderKey(t)]
  )
}

/** La clave incluye la hora del recordatorio: si se reprograma, vuelve a avisar. */
export function reminderKey(t: Task): string {
  return `task:${t.id}:${t.remindAt}`
}

/** Enlace para redactar el correo de una tarea en la web del proveedor. */
export function composeUrl(provider: 'google' | 'microsoft', email: { to: string; subject: string; body: string }): string {
  if (provider === 'google') {
    const p = new URLSearchParams({ view: 'cm', fs: '1', to: email.to, su: email.subject, body: email.body })
    return `https://mail.google.com/mail/u/0/?${p.toString()}`
  }
  const p = new URLSearchParams({ to: email.to, subject: email.subject, body: email.body })
  return `https://outlook.office.com/mail/deeplink/compose?${p.toString()}`
}
