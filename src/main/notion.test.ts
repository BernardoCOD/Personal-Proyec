import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncTasks } from './notion'
import { databaseSchema, NOTION_PROPS } from '@shared/notionMap'
import { newTask, updateTask } from '@shared/tasks'
import type { AppData, Task } from '@shared/types'

// Notion simulado en memoria: guarda las páginas como lo haría la API.
type Page = { id: string; last_edited_time: string; archived: boolean; properties: Record<string, unknown> }

function fakeNotion() {
  const pages = new Map<string, Page>()
  let n = 0
  const withPlain = (props: Record<string, unknown>) => {
    const copy = JSON.parse(JSON.stringify(props)) as Record<string, { title?: { text: { content: string }; plain_text?: string }[]; rich_text?: { text: { content: string }; plain_text?: string }[] }>
    for (const v of Object.values(copy)) for (const p of v.title ?? v.rich_text ?? []) p.plain_text = p.text.content
    return copy
  }
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace('https://api.notion.com/v1', '')
    const body = init.body ? JSON.parse(String(init.body)) : {}
    const method = init.method ?? 'GET'
    if (method === 'GET' && path.startsWith('/databases/')) {
      const props = Object.fromEntries(Object.entries(databaseSchema()).map(([k, v]) => [k, { type: Object.keys(v as object)[0] }]))
      return Response.json({ properties: props })
    }
    if (method === 'POST' && path.endsWith('/query')) {
      return Response.json({ results: [...pages.values()].filter((p) => !p.archived), has_more: false, next_cursor: null })
    }
    if (method === 'POST' && path === '/pages') {
      const page: Page = { id: `page-${++n}`, last_edited_time: new Date().toISOString(), archived: false, properties: withPlain(body.properties) }
      pages.set(page.id, page)
      return Response.json(page)
    }
    if (method === 'PATCH' && path.startsWith('/pages/')) {
      const page = pages.get(path.slice(7))
      if (!page) return Response.json({ message: 'not found' }, { status: 404 })
      if (body.archived) page.archived = true
      if (body.properties) page.properties = { ...page.properties, ...withPlain(body.properties) }
      page.last_edited_time = new Date().toISOString()
      return Response.json(page)
    }
    return Response.json({ message: 'ruta no simulada' }, { status: 400 })
  }
  /** Simula una edición hecha desde la app de Notion del celular. */
  const phoneEdit = (id: string, props: Record<string, unknown>) => {
    const page = pages.get(id)!
    page.properties = { ...page.properties, ...withPlain(props) }
    page.last_edited_time = new Date(Date.now() + 60_000).toISOString()
  }
  const phoneCreate = (title: string) => {
    const id = `page-${++n}`
    pages.set(id, { id, last_edited_time: new Date().toISOString(), archived: false, properties: withPlain({ [NOTION_PROPS.title]: { title: [{ text: { content: title } }] }, [NOTION_PROPS.status]: { select: { name: 'Pendiente' } } }) })
    return id
  }
  return { pages, fetchImpl, phoneEdit, phoneCreate }
}

function baseData(tasks: Task[]): AppData {
  return { tasks, notionPendingArchive: [] } as unknown as AppData
}

/** Aplica el resultado como lo hace la app. */
function apply(data: AppData, r: Awaited<ReturnType<typeof syncTasks>>): AppData {
  const map = new Map(data.tasks.map((t) => [t.id, t]))
  for (const t of r.upserts) map.set(t.id, t)
  for (const id of r.deletes) map.delete(id)
  return { ...data, tasks: [...map.values()], notionPendingArchive: data.notionPendingArchive.filter((p) => !r.archived.includes(p)) }
}

afterEach(() => vi.unstubAllGlobals())

describe('sincronización con Notion', () => {
  it('sube, trae cambios del celular, importa tareas nuevas y propaga borrados', { timeout: 30_000 }, async () => {
    const notion = fakeNotion()
    vi.stubGlobal('fetch', notion.fetchImpl)
    const t0 = new Date('2026-10-02T10:00:00Z')

    // 1. Primera sincronización: las tareas locales se crean en Notion.
    let data = baseData([
      newTask({ title: 'Enviar informe', email: { accountId: null, to: 'jefe@x.com', subject: 'Informe', body: '' } }, t0, 'a'),
      newTask({ title: 'Estudiar', dueDate: '2026-10-05' }, t0, 'b')
    ])
    let r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    expect(notion.pages.size).toBe(2)
    expect(data.tasks.every((t) => t.notion?.pageId)).toBe(true)

    // 2. Sin cambios: no hace nada.
    r = await syncTasks('tok', 'db', data)
    expect(r.summary).toBe('Todo al día')

    // 3. Desde el celular: marca "Enviar informe" como hecha y crea una tarea nueva.
    const pageA = data.tasks.find((t) => t.id === 'a')!.notion!.pageId
    notion.phoneEdit(pageA, { [NOTION_PROPS.status]: { select: { name: 'Hecha' } } })
    const newPage = notion.phoneCreate('Comprar útiles')
    r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    expect(data.tasks.find((t) => t.id === 'a')?.status).toBe('hecha')
    const imported = data.tasks.find((t) => t.title === 'Comprar útiles')
    expect(imported?.notion?.pageId).toBe(newPage)
    expect((notion.pages.get(newPage)!.properties[NOTION_PROPS.localId] as { rich_text: { plain_text: string }[] }).rich_text[0].plain_text).toBe(imported?.id)

    // 4. La siguiente sincronización no duplica nada.
    r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    expect(data.tasks).toHaveLength(3)
    expect(notion.pages.size).toBe(3)

    // 5. Edición local: se sube.
    data = { ...data, tasks: data.tasks.map((t) => (t.id === 'b' ? updateTask(t, { title: 'Estudiar cálculo' }, new Date(Date.now() + 120_000)) : t)) }
    r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    const pageB = data.tasks.find((t) => t.id === 'b')!.notion!.pageId
    expect((notion.pages.get(pageB)!.properties[NOTION_PROPS.title] as { title: { plain_text: string }[] }).title[0].plain_text).toBe('Estudiar cálculo')

    // 6. Borrado local: se archiva en Notion.
    data = { ...data, tasks: data.tasks.filter((t) => t.id !== 'b'), notionPendingArchive: [pageB] }
    r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    expect(notion.pages.get(pageB)!.archived).toBe(true)
    expect(data.notionPendingArchive).toEqual([])

    // 7. Borrado en Notion (desde el celular): se borra aquí.
    notion.pages.get(newPage)!.archived = true
    r = await syncTasks('tok', 'db', data)
    data = apply(data, r)
    expect(data.tasks.find((t) => t.title === 'Comprar útiles')).toBeUndefined()
    expect(data.tasks.map((t) => t.id)).toEqual(['a'])
  })

  it('detecta una base de datos con columnas faltantes', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ properties: { Nombre: { type: 'title' } } }))
    await expect(syncTasks('tok', 'db', baseData([]))).rejects.toThrow('le faltan columnas')
  })
})
