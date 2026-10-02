import { shell } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { OAuthTokens } from './secrets'

// Inicio de sesión OAuth 2.0 para apps de escritorio (PKCE + redirección a 127.0.0.1).
// Se abre tu navegador normal; Centro de Mando nunca ve tu contraseña.

export interface OAuthConfig {
  name: string
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  extraAuthParams?: Record<string, string>
  /** Microsoft exige "localhost"; Google acepta 127.0.0.1. */
  host: 'localhost' | '127.0.0.1'
  /** Microsoft pide los scopes también al renovar el token; Google no. */
  scopeOnRefresh: boolean
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

const base64url = (buf: Buffer): string => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const PAGE = (title: string, msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>${title}</h1><p>${msg}</p></div></body>`

export async function authorize(cfg: OAuthConfig, timeoutMs = 5 * 60_000): Promise<OAuthTokens> {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  // Solo se escucha en la propia computadora (nunca en la red).
  const server: Server = createServer()
  await listen(server, 0, '127.0.0.1')
  const port = (server.address() as AddressInfo).port
  const servers = [server]
  if (cfg.host === 'localhost') {
    // En Windows "localhost" puede resolverse a ::1 (IPv6): se escucha también ahí.
    const v6 = createServer()
    if (await listen(v6, port, '::1').then(() => true, () => false)) servers.push(v6)
  }
  const redirectUri = `http://${cfg.host}:${port}`

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...cfg.extraAuthParams
  })

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new OAuthError('Se agotó el tiempo para iniciar sesión (5 minutos).')), timeoutMs)
      const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
        const url = new URL(req.url ?? '/', redirectUri)
        const got = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        if (!got && !error) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        clearTimeout(timer)
        if (error) {
          res.end(PAGE('No se pudo conectar', 'Puedes cerrar esta pestaña y volver a Centro de Mando.'))
          const desc = url.searchParams.get('error_description') ?? error
          reject(new OAuthError(`${cfg.name} rechazó el inicio de sesión: ${desc}`, error))
        } else if (url.searchParams.get('state') !== state) {
          res.end(PAGE('No se pudo conectar', 'La respuesta no coincide. Inténtalo de nuevo.'))
          reject(new OAuthError('La respuesta de inicio de sesión no es válida (state).'))
        } else {
          res.end(PAGE('¡Cuenta conectada!', 'Ya puedes cerrar esta pestaña y volver a Centro de Mando.'))
          resolve(got as string)
        }
      }
      for (const srv of servers) srv.on('request', onRequest)
      void shell.openExternal(`${cfg.authUrl}?${params.toString()}`)
    })

    return await exchange(cfg, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  } finally {
    for (const srv of servers) srv.close()
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
}

export async function refresh(cfg: OAuthConfig, refreshToken: string): Promise<OAuthTokens> {
  const body: Record<string, string> = { grant_type: 'refresh_token', refresh_token: refreshToken }
  if (cfg.scopeOnRefresh) body.scope = cfg.scopes.join(' ')
  const t = await exchange(cfg, body)
  // Google no siempre devuelve un refresh token nuevo: se conserva el anterior.
  return { ...t, refreshToken: t.refreshToken || refreshToken }
}

async function exchange(cfg: OAuthConfig, body: Record<string, string>): Promise<OAuthTokens> {
  const form = new URLSearchParams({ client_id: cfg.clientId, ...body })
  if (cfg.clientSecret) form.set('client_secret', cfg.clientSecret)
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = String(json.error ?? res.status)
    const desc = String(json.error_description ?? json.error ?? res.statusText)
    throw new OAuthError(`${cfg.name}: ${desc}`, code)
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : '',
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000
  }
}
