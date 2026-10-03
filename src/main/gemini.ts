import { z } from 'zod'

// Cliente mínimo de la API de Gemini (Google AI Studio), que tiene un nivel gratuito.
// Se usa la API REST directamente para no agregar otra dependencia.

const API = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status = 0
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
      throw new GeminiError('Se alcanzó el límite gratuito de Gemini por ahora. Se reintentará más tarde.', 429)
    }
    if (res.status === 404) throw new GeminiError(`El modelo no está disponible: ${msg}`, 404)
    throw new GeminiError(`Error de Gemini (${res.status}): ${msg}`, res.status)
  }
  return json
}

/** Elige un modelo "flash" disponible para tu clave (los nombres cambian con el tiempo). */
export async function pickFlashModel(apiKey: string): Promise<string | null> {
  const res = (await call(apiKey, 'models?pageSize=200')) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (res.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|exp|preview|thinking|embedding)/.test(n))
  // Prefiere "flash" sobre "flash-lite" y la versión más alta.
  names.sort((a, b) => Number(a.includes('lite')) - Number(b.includes('lite')) || b.localeCompare(a, 'en', { numeric: true }))
  return names[0] ?? null
}

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

  let used = model
  let res: GeminiResponse
  try {
    res = (await call(apiKey, `models/${encodeURIComponent(used)}:generateContent`, body)) as GeminiResponse
  } catch (err) {
    if (!(err instanceof GeminiError && err.status === 404)) throw err
    const other = await pickFlashModel(apiKey)
    if (!other || other === used) throw err
    used = other
    res = (await call(apiKey, `models/${encodeURIComponent(used)}:generateContent`, body)) as GeminiResponse
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
