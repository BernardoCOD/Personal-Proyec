import { randomUUID } from 'node:crypto'
import type { AppData, Task } from '@shared/types'
import {
  NOTION_PROPS,
  applyRemote,
  databaseSchema,
  decideSync,
  fieldsOfTask,
  hashFields,
  pageToRemote,
  taskToProperties,
  type NotionPageLike,
  type RemoteTask
} from '@shared/notionMap'
import { newTask } from '@shared/tasks'

// Sincronización de tareas con una base de datos de Notion, para verlas y
// marcarlas desde el celular con la app de Notion.

const NOTION_VERSION = '2022-06-28'
const API = 'https://api.notion.com/v1'

export class NotionError extends Error {}

async function notion<T>(token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? '1')
      await sleep(Math.min(10, wait) * 1000)
      continue
    }
    const json = (await res.json().catch(() => ({}))) as { message?: string; code?: string }
    if (!res.ok) {
      if (res.status === 401) throw new NotionError('El token de Notion no es válido.')
      if (res.status === 404) {
        throw new NotionError('Notion no encuentra la página o base de datos. ¿La compartiste con tu integración (menú ··· → Conexiones)?')
      }
      throw new NotionError(`Notion: ${json.message ?? res.statusText}`)
    }
    return json as T
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Crea la base de datos "Tareas · Centro de Mando" dentro de una página. */
export async function createDatabase(token: string, parentPageId: string): Promise<string> {
  const db = await notion<{ id: string }>(token, '/databases', 'POST', {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Tareas · Centro de Mando' } }],
    properties: databaseSchema()
  })
  return db.id
}

/** Revisa que la base de datos tenga las columnas que usa la app. */
export async function checkDatabase(token: string, databaseId: string): Promise<string[]> {
  const db = await notion<{ properties: Record<string, { type: string }> }>(token, `/databases/${databaseId}`)
  const expected = databaseSchema() as Record<string, Record<string, unknown>>
  return Object.entries(expected)
    .filter(([name, def]) => db.properties[name]?.type !== Object.keys(def)[0])
    .map(([name]) => name)
}

async function queryAll(token: string, databaseId: string): Promise<NotionPageLike[]> {
  const pages: NotionPageLike[] = []
  let cursor: string | undefined
  do {
    const res = await notion<{ results: NotionPageLike[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/databases/${databaseId}/query`,
      'POST',
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
    )
    pages.push(...res.results)
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined
  } while (cursor && pages.length < 2000)
  return pages
}

/** Cambios que la sincronización aplica sobre los datos locales. */
export interface SyncResult {
  upserts: Task[]
  deletes: string[]
  archived: string[]
  summary: string
}

const OLD_DONE_MS = 30 * 86_400_000

export async function syncTasks(token: string, databaseId: string, data: AppData, now = new Date()): Promise<SyncResult> {
  const missing = await checkDatabase(token, databaseId)
  if (missing.length > 0) {
    throw new NotionError(`A la base de datos de Notion le faltan columnas: ${missing.join(', ')}. Usa "Crear base de datos" en Ajustes.`)
  }

  const result: SyncResult = { upserts: [], deletes: [], archived: [], summary: '' }
  let pushed = 0
  let pulled = 0
  let created = 0

  // 1. Archivar en Notion lo que se borró aquí.
  for (const pageId of data.notionPendingArchive) {
    await notion(token, `/pages/${pageId}`, 'PATCH', { archived: true }).catch((err: unknown) => {
      if (!(err instanceof NotionError && /no encuentra/.test(err.message))) throw err
    })
    result.archived.push(pageId)
    await sleep(350)
  }
  const archivedSet = new Set(result.archived)

  const pages = await queryAll(token, databaseId)
  const presentPages = new Set(pages.filter((p) => !p.archived && !p.in_trash).map((p) => p.id))
  const remotes = pages.map(pageToRemote).filter((r): r is RemoteTask => r !== null)
  const byPage = new Map(remotes.map((r) => [r.pageId, r]))
  const linkedPages = new Set<string>()

  const stamp = (t: Task, pageId: string): Task => ({
    ...t,
    notion: { pageId, syncedAt: new Date().toISOString(), hash: hashFields(fieldsOfTask(t)) }
  })

  // 2. Tareas locales.
  for (const task of data.tasks) {
    if (task.notion) {
      linkedPages.add(task.notion.pageId)
      const remote = byPage.get(task.notion.pageId)
      // La página existe pero no se puede leer (p. ej. sin título): no se toca.
      if (!remote && presentPages.has(task.notion.pageId)) continue
      if (!remote) {
        // Se borró en Notion. Si aquí no cambió desde la última vez, se borra también aquí.
        if (task.updatedAt <= task.notion.syncedAt) {
          result.deletes.push(task.id)
          continue
        }
        const page = await notion<{ id: string }>(token, '/pages', 'POST', {
          parent: { database_id: databaseId },
          properties: taskToProperties(task)
        })
        result.upserts.push(stamp(task, page.id))
        created++
        await sleep(350)
        continue
      }
      const decision = decideSync(task, remote)
      if (decision === 'push') {
        await notion(token, `/pages/${remote.pageId}`, 'PATCH', { properties: taskToProperties(task) })
        result.upserts.push(stamp(task, remote.pageId))
        pushed++
        await sleep(350)
      } else if (decision === 'pull') {
        result.upserts.push(applyRemote(task, remote, now))
        pulled++
      } else if (task.notion.hash !== hashFields(fieldsOfTask(task))) {
        result.upserts.push(stamp(task, remote.pageId))
      }
    } else {
      const oldDone = task.status === 'hecha' && task.completedAt && now.getTime() - new Date(task.completedAt).getTime() > OLD_DONE_MS
      if (oldDone) continue
      const page = await notion<{ id: string }>(token, '/pages', 'POST', {
        parent: { database_id: databaseId },
        properties: taskToProperties(task)
      })
      linkedPages.add(page.id)
      result.upserts.push(stamp(task, page.id))
      created++
      await sleep(350)
    }
  }

  // 3. Tareas creadas en Notion (por ejemplo desde el celular).
  const localIds = new Set(data.tasks.map((t) => t.id))
  for (const remote of remotes) {
    if (linkedPages.has(remote.pageId) || archivedSet.has(remote.pageId)) continue
    if (remote.localId && localIds.has(remote.localId)) continue
    const id = randomUUID()
    const t = applyRemote(newTask({ title: remote.fields.title }, now, id), remote, now)
    await notion(token, `/pages/${remote.pageId}`, 'PATCH', {
      properties: { [NOTION_PROPS.localId]: { rich_text: [{ type: 'text', text: { content: id } }] } }
    })
    result.upserts.push(t)
    pulled++
    await sleep(350)
  }

  const parts = []
  if (created) parts.push(`${created} subidas`)
  if (pushed) parts.push(`${pushed} actualizadas en Notion`)
  if (pulled) parts.push(`${pulled} traídas de Notion`)
  if (result.deletes.length) parts.push(`${result.deletes.length} borradas`)
  result.summary = parts.length ? parts.join(', ') : 'Todo al día'
  return result
}
