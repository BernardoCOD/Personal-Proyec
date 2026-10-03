import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeMail, testKey, type AiConfig } from './ai'
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

const claude = (model: string): AiConfig => ({ provider: 'anthropic', apiKey: 'sk-test', model })

describe('IA con Claude', () => {
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
    const out = await analyzeMail(claude('claude-opus-5-5'), [mail('m1')], '2026-10-02')
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
    expect(await testKey({ ...claude('claude-haiku-4-5') })).toBe('Hola')
    expect(body.fallbacks).toBeUndefined()
    expect((body.output_config as Record<string, unknown>).effort).toBeUndefined()
  })

  it('traduce errores de la API a mensajes en español', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
    await expect(testKey({ ...claude('claude-opus-5-5'), apiKey: 'sk-malo' })).rejects.toThrow('La API key de Anthropic no es válida.')
  })

  it('avisa si la respuesta fue rechazada', async () => {
    vi.stubGlobal('fetch', async () => fakeResponse({}, 'refusal'))
    await expect(testKey(claude('claude-opus-5-5'))).rejects.toThrow('Claude no pudo procesar este contenido.')
  })
})

describe('IA con Gemini', () => {
  const gemini = (onModelChange?: (m: string) => void): AiConfig => ({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.5-flash', onModelChange })
  const reply = (json: unknown, finishReason = 'STOP') =>
    Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, finishReason }] })

  it('envía un esquema JSON válido para Gemini y lee la respuesta', async () => {
    let body: { generationConfig: { responseMimeType: string; responseSchema: Record<string, unknown> } } | null = null
    let url = ''
    let key = ''
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      url = String(u)
      key = new Headers(init.headers).get('x-goog-api-key') ?? ''
      body = JSON.parse(String(init.body))
      return reply({
        correos: [{ id: 'm1', categoria: 'estatal', importancia: 'alta', requiere_accion: true, accion: 'Responder', fecha_limite: null, resumen: 'Plazo.' }]
      })
    })
    const out = await analyzeMail(gemini(), [mail('m1')], '2026-10-02')
    expect(out[0]).toMatchObject({ id: 'm1', category: 'estatal', needsAction: true, deadline: null, source: 'ia' })
    expect(url).toContain('/models/gemini-2.5-flash:generateContent')
    expect(key).toBe('AIza-test')
    expect(body!.generationConfig.responseMimeType).toBe('application/json')
    const item = (body!.generationConfig.responseSchema as { properties: { correos: { items: { properties: Record<string, { type: string; enum?: string[]; nullable?: boolean }> } } } }).properties.correos.items.properties
    expect(item.categoria).toMatchObject({ type: 'STRING', enum: expect.arrayContaining(['estatal']) })
    expect(item.fecha_limite).toEqual({ type: 'STRING', nullable: true })
    expect(item.requiere_accion.type).toBe('BOOLEAN')
  })

  it('si el modelo ya no existe, elige otro "flash" y lo recuerda', async () => {
    const urls: string[] = []
    const changed: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(String(u))
      if (String(u).includes('gemini-2.5-flash:')) return Response.json({ error: { message: 'models/gemini-2.5-flash is not found' } }, { status: 404 })
      if (String(u).includes('/models?')) {
        return Response.json({
          models: [
            { name: 'models/gemini-4-flash-lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-flash-image', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-pro', supportedGenerationMethods: ['generateContent'] }
          ]
        })
      }
      return reply({ saludo: 'Hola' })
    })
    expect(await testKey(gemini((m) => changed.push(m)))).toBe('Hola')
    expect(changed).toEqual(['gemini-4-flash'])
    expect(urls.at(-1)).toContain('/models/gemini-4-flash:generateContent')
  })

  it('traduce los errores de Gemini', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, { status: 400 }))
    await expect(testKey(gemini())).rejects.toThrow('La API key de Gemini no es válida.')
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'quota' } }, { status: 429 }))
    await expect(testKey(gemini())).rejects.toThrow('límite gratuito')
    vi.stubGlobal('fetch', async () => reply({}, 'SAFETY'))
    await expect(testKey(gemini())).rejects.toThrow('no pudo procesar')
    vi.stubGlobal('fetch', async () => reply({}, 'MAX_TOKENS'))
    await expect(testKey(gemini())).rejects.toThrow('incompleta')
  })
})
