import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeMail, testKey } from './ai'
import type { MailMessage } from '@shared/types'

// Se simula la API de Anthropic para revisar la forma de la petición y la lectura de la respuesta.

function fakeResponse(json: unknown, stop = 'end_turn') {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: stop,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

const mail = (id: string): MailMessage => ({
  id, threadId: id, from: 'Muni', fromEmail: 'x@muni.gob.pe', subject: 'Notificación', snippet: 'Plazo de 5 días', date: '2026-10-02T10:00:00Z', unread: true, labels: ['UNREAD'], link: ''
})

afterEach(() => vi.unstubAllGlobals())

describe('IA', () => {
  it('pide JSON estructurado con fallback y descarta ids desconocidos', async () => {
    const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) })
      return fakeResponse({
        correos: [
          { id: 'm1', categoria: 'estatal', importancia: 'alta', requiere_accion: true, accion: 'Responder', fecha_limite: '2026-10-09', resumen: 'Plazo.' },
          { id: 'inventado', categoria: 'otro', importancia: 'baja', requiere_accion: false, accion: '', fecha_limite: null, resumen: '' }
        ]
      })
    })
    const out = await analyzeMail('sk-test', 'claude-opus-5-5', [mail('m1')], '2026-10-02')
    expect(out).toEqual([
      { id: 'm1', category: 'estatal', importance: 'alta', needsAction: true, action: 'Responder', deadline: '2026-10-09', summary: 'Plazo.', source: 'ia' }
    ])
    const { body, headers } = calls[0]
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.fallbacks).toBe('default')
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect((body.output_config as { effort: string }).effort).toBe('low')
    expect((body.output_config as { format: { type: string } }).format.type).toBe('json_schema')
    expect(body.thinking).toBeUndefined()
  })

  it('Haiku no recibe effort ni fallback', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return fakeResponse({ saludo: 'Hola' })
    })
    expect(await testKey('sk-test', 'claude-haiku-4-5')).toBe('Hola')
    expect(body.fallbacks).toBeUndefined()
    expect((body.output_config as Record<string, unknown>).effort).toBeUndefined()
  })

  it('traduce errores de la API a mensajes en español', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
    await expect(testKey('sk-malo', 'claude-opus-5-5')).rejects.toThrow('La API key de Anthropic no es válida.')
  })

  it('avisa si la respuesta fue rechazada', async () => {
    vi.stubGlobal('fetch', async () => fakeResponse({}, 'refusal'))
    await expect(testKey('sk-test', 'claude-opus-5-5')).rejects.toThrow('Claude no pudo procesar este contenido.')
  })
})
