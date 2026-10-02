import type { Priority, Task, TaskArea, TaskStatus } from './types'

// Conversión entre tareas locales y páginas de una base de datos de Notion,
// y la regla que decide hacia dónde sincronizar cada tarea.

export const NOTION_PROPS = {
  title: 'Nombre',
  status: 'Estado',
  area: 'Área',
  priority: 'Prioridad',
  due: 'Fecha',
  to: 'Para',
  subject: 'Asunto',
  notes: 'Notas',
  localId: 'ID Centro'
} as const

const STATUS_TO_NOTION: Record<TaskStatus, string> = { pendiente: 'Pendiente', en_progreso: 'En progreso', hecha: 'Hecha' }
const AREA_TO_NOTION: Record<TaskArea, string> = { estudio: 'Estudio', trabajo: 'Trabajo', personal: 'Personal', tramite: 'Trámite' }
const PRIORITY_TO_NOTION: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

const invert = <K extends string>(m: Record<K, string>): Record<string, K> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [String(v).toLowerCase(), k])) as Record<string, K>

const STATUS_FROM = invert(STATUS_TO_NOTION)
const AREA_FROM = invert(AREA_TO_NOTION)
const PRIORITY_FROM = invert(PRIORITY_TO_NOTION)

/** Esquema para crear la base de datos (API de Notion 2022-06-28). */
export function databaseSchema(): Record<string, unknown> {
  const select = (names: string[]) => ({ select: { options: names.map((name) => ({ name })) } })
  return {
    [NOTION_PROPS.title]: { title: {} },
    [NOTION_PROPS.status]: select(Object.values(STATUS_TO_NOTION)),
    [NOTION_PROPS.area]: select(Object.values(AREA_TO_NOTION)),
    [NOTION_PROPS.priority]: select(Object.values(PRIORITY_TO_NOTION)),
    [NOTION_PROPS.due]: { date: {} },
    [NOTION_PROPS.to]: { rich_text: {} },
    [NOTION_PROPS.subject]: { rich_text: {} },
    [NOTION_PROPS.notes]: { rich_text: {} },
    [NOTION_PROPS.localId]: { rich_text: {} }
  }
}

export interface SyncFields {
  title: string
  status: TaskStatus
  area: TaskArea
  priority: Priority
  dueDate: string | null
  notes: string
  emailTo: string
  emailSubject: string
}

export function fieldsOfTask(t: Task): SyncFields {
  return {
    title: t.title,
    status: t.status,
    area: t.area,
    priority: t.priority,
    dueDate: t.dueDate,
    notes: t.notes,
    emailTo: t.email?.to ?? '',
    emailSubject: t.email?.subject ?? ''
  }
}

export function hashFields(f: SyncFields): string {
  // Orden de claves fijo para que el hash sea estable.
  return JSON.stringify([f.title, f.status, f.area, f.priority, f.dueDate, f.notes, f.emailTo, f.emailSubject])
}

// Notion limita cada bloque de texto a 2000 caracteres.
const text = (value: string) => (value ? [{ type: 'text', text: { content: value.slice(0, 2000) } }] : [])

export function taskToProperties(t: Task): Record<string, unknown> {
  const f = fieldsOfTask(t)
  return {
    [NOTION_PROPS.title]: { title: text(f.title || '(sin título)') },
    [NOTION_PROPS.status]: { select: { name: STATUS_TO_NOTION[f.status] } },
    [NOTION_PROPS.area]: { select: { name: AREA_TO_NOTION[f.area] } },
    [NOTION_PROPS.priority]: { select: { name: PRIORITY_TO_NOTION[f.priority] } },
    [NOTION_PROPS.due]: { date: f.dueDate ? { start: f.dueDate } : null },
    [NOTION_PROPS.to]: { rich_text: text(f.emailTo) },
    [NOTION_PROPS.subject]: { rich_text: text(f.emailSubject) },
    [NOTION_PROPS.notes]: { rich_text: text(f.notes) },
    [NOTION_PROPS.localId]: { rich_text: text(t.id) }
  }
}

export interface NotionPageLike {
  id: string
  last_edited_time: string
  archived?: boolean
  in_trash?: boolean
  properties: Record<string, unknown>
}

type Prop = { type?: string; title?: { plain_text?: string }[]; rich_text?: { plain_text?: string }[]; select?: { name?: string } | null; date?: { start?: string } | null }

function plain(p: Prop | undefined): string {
  const parts = p?.title ?? p?.rich_text ?? []
  return parts.map((x) => x.plain_text ?? '').join('')
}

export interface RemoteTask {
  pageId: string
  editedAt: string
  localId: string
  fields: SyncFields
}

export function pageToRemote(page: NotionPageLike): RemoteTask | null {
  if (page.archived || page.in_trash) return null
  const props = page.properties as Record<string, Prop>
  const title = plain(props[NOTION_PROPS.title]).trim()
  if (!title) return null
  const sel = (key: string) => (props[key]?.select?.name ?? '').toLowerCase()
  const start = props[NOTION_PROPS.due]?.date?.start ?? null
  return {
    pageId: page.id,
    editedAt: page.last_edited_time,
    localId: plain(props[NOTION_PROPS.localId]).trim(),
    fields: {
      title,
      status: STATUS_FROM[sel(NOTION_PROPS.status)] ?? 'pendiente',
      area: AREA_FROM[sel(NOTION_PROPS.area)] ?? 'personal',
      priority: PRIORITY_FROM[sel(NOTION_PROPS.priority)] ?? 'media',
      // Notion puede devolver fecha con hora; nos quedamos con el día.
      dueDate: start ? start.slice(0, 10) : null,
      notes: plain(props[NOTION_PROPS.notes]),
      emailTo: plain(props[NOTION_PROPS.to]).trim(),
      emailSubject: plain(props[NOTION_PROPS.subject]).trim()
    }
  }
}

export type SyncDecision = 'push' | 'pull' | 'none'

/**
 * Decide qué hacer con una tarea que existe en ambos lados.
 * - Solo cambió la local -> subir.
 * - Solo cambió Notion -> bajar.
 * - Cambiaron ambas -> gana la edición más reciente.
 */
export function decideSync(task: Task, remote: RemoteTask): SyncDecision {
  const base = task.notion?.hash ?? ''
  const remoteHash = hashFields(remote.fields)
  const localHash = hashFields(fieldsOfTask(task))
  if (remoteHash === localHash) return 'none'
  const syncedAt = task.notion?.syncedAt ?? ''
  const localChanged = task.updatedAt > syncedAt && localHash !== base
  const remoteChanged = remoteHash !== base
  if (localChanged && !remoteChanged) return 'push'
  if (remoteChanged && !localChanged) return 'pull'
  return new Date(remote.editedAt).getTime() > new Date(task.updatedAt).getTime() ? 'pull' : 'push'
}

/** Aplica los campos de Notion a una tarea local. */
export function applyRemote(task: Task, remote: RemoteTask, now: Date): Task {
  const f = remote.fields
  const email = f.emailTo || f.emailSubject
    ? { accountId: task.email?.accountId ?? null, to: f.emailTo, subject: f.emailSubject, body: task.email?.body ?? '' }
    : null
  const iso = now.toISOString()
  const completedAt = f.status === 'hecha' ? task.completedAt ?? iso : null
  const next: Task = {
    ...task,
    title: f.title,
    status: f.status,
    area: f.area,
    priority: f.priority,
    dueDate: f.dueDate,
    notes: f.notes,
    email,
    completedAt,
    updatedAt: iso
  }
  next.notion = { pageId: remote.pageId, syncedAt: iso, hash: hashFields(fieldsOfTask(next)) }
  return next
}

/** Extrae el id (32 hex) de un enlace o id de Notion. */
export function parseNotionId(input: string): string | null {
  const clean = input.trim().split(/[?#]/)[0].replace(/-/g, '')
  const m = /([0-9a-f]{32})$/i.exec(clean)
  if (!m) return null
  const h = m[1].toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
