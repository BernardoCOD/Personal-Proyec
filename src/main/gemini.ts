import { z } from 'zod'

// Cliente mínimo de la API de Gemini (Google AI Studio), que tiene un nivel gratuito.
// Se usa la API REST directamente para no agregar otra dependencia.

const API = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    /** Mensaje original de Google, para diagnosticar. */
    readonly detail = ''
  ) {
    super(message)
  }
}

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  anyOf?: JsonSchema[]
  description?: string
}

type GeminiSchema = {
  type: string
  properties?: Record<string, GeminiSchema>
  required?: string[]
  items?: GeminiSchema
  enum?: string[]
  nullable?: boolean
  propertyOrdering?: string[]
}

/** Convierte el JSON Schema que genera zod al formato de esquema de Gemini (subconjunto de OpenAPI). */
export function toGeminiSchema(s: JsonSchema): GeminiSchema {
  if (s.anyOf) {
    const nonNull = s.anyOf.filter((x) => x.type !== 'null')
    if (nonNull.length !== 1) throw new Error('Esquema no soportado por Gemini (anyOf).')
    return { ...toGeminiSchema(nonNull[0]), nullable: true }
  }
  let type = s.type
  let nullable = false
  if (Array.isArray(type)) {
    nullable = type.includes('null')
    const rest = type.filter((t) => t !== 'null')
    if (rest.length !== 1) throw new Error('Esquema no soportado por Gemini (varios tipos).')
    type = rest[0]
  }
  if (!type) throw new Error('Esquema sin tipo.')
  const out: GeminiSchema = { type: type.toUpperCase() }
  if (nullable) out.nullable = true
  if (s.enum) out.enum = s.enum.map(String)
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]))
    out.propertyOrdering = Object.keys(s.properties)
    if (s.required?.length) out.required = s.required
  }
  if (s.items) out.items = toGeminiSchema(s.items)
  return out
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

async function call(apiKey: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000)
    })
  } catch {
    throw new GeminiError('Sin conexión con la API de Gemini.')
  }
  const json = (await res.json().catch(() => ({}))) as GeminiResponse
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError('La API key de Gemini no es válida.', 400)
    if (res.status === 403) throw new GeminiError('La API key de Gemini no tiene permiso (¿está habilitada la API en tu proyecto?).', 403)
    if (res.status === 429) {
      throw new GeminiError('Se alcanzó el límite gratuito de Gemini por ahora. Se reintentará más tarde.', 429, msg)
    }
    if (res.status === 404) throw new GeminiError(`El modelo no está disponible: ${msg}`, 404, msg)
    throw new GeminiError(`Error de Gemini (${res.status}): ${msg}`, res.status)
  }
  return json
}

/**
 * Modelos "flash" disponibles para tu clave, del preferido al menos preferido
 * (los nombres y las cuotas gratuitas cambian con el tiempo).
 */
export async function listFlashModels(apiKey: string): Promise<string[]> {
  const res = (await call(apiKey, 'models?pageSize=200')) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (res.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|exp|thinking|embedding)/.test(n))
  // Primero las versiones estables, luego "flash" antes que "flash-lite", y la versión más alta.
  const rank = (n: string) => Number(n.includes('preview')) * 2 + Number(n.includes('lite'))
  return names.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a, 'en', { numeric: true }))
}

/** 404 = el modelo ya no existe; 429 = sin cuota para ese modelo (otro puede tenerla). */
const shouldTryAnother = (err: unknown): err is GeminiError => err instanceof GeminiError && (err.status === 404 || err.status === 429)

/**
 * Pide a Gemini una respuesta JSON que cumpla el esquema.
 * Si el modelo configurado ya no existe, busca otro "flash" y devuelve cuál usó.
 */
export async function geminiStructured<T extends z.ZodType>(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  schema: T
): Promise<{ data: z.infer<T>; model: string }> {
  if (!apiKey) throw new GeminiError('Falta la API key de Gemini (Ajustes → Inteligencia artificial).')
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(z.toJSONSchema(schema) as JsonSchema),
      maxOutputTokens: 16384
    }
  }

  const generate = (m: string) => call(apiKey, `models/${encodeURIComponent(m)}:generateContent`, body) as Promise<GeminiResponse>
  let used = model
  let res: GeminiResponse
  try {
    res = await generate(used)
  } catch (err) {
    if (!shouldTryAnother(err)) throw err
    // El modelo configurado no existe o no tiene cuota gratuita: se prueban los demás "flash".
    let last: GeminiError = err
    let found: GeminiResponse | null = null
    for (const other of (await listFlashModels(apiKey)).filter((m) => m !== model).slice(0, 6)) {
      try {
        found = await generate(other)
        used = other
        break
      } catch (e) {
        if (!shouldTryAnother(e)) throw e
        last = e
      }
    }
    if (!found) {
      if (last.status === 429) {
        throw new GeminiError(`Ningún modelo gratuito de Gemini tiene cuota disponible ahora. Google dice: ${last.detail.slice(0, 220)}`, 429, last.detail)
      }
      throw last
    }
    res = found
  }

  if (res.promptFeedback?.blockReason) throw new GeminiError('Gemini no pudo procesar este contenido.')
  const cand = res.candidates?.[0]
  if (!cand) throw new GeminiError('Gemini no devolvió respuesta.')
  if (cand.finishReason === 'MAX_TOKENS') throw new GeminiError('La respuesta de la IA quedó incompleta. Inténtalo de nuevo.')
  if (cand.finishReason && cand.finishReason !== 'STOP') throw new GeminiError('Gemini no pudo procesar este contenido.')
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new GeminiError('La IA devolvió una respuesta que no se pudo leer.')
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new GeminiError('La IA devolvió una respuesta con un formato inesperado.')
  return { data: parsed.data as z.infer<T>, model: used }
}
