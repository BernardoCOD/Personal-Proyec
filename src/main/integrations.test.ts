import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'node:http'

// El "navegador" simulado: cuando la app abre la URL de inicio de sesión,
// respondemos llamando a la redirección local como lo haría Google/Microsoft.
let browserBehavior: (authUrl: URL) => string = () => ''
vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async (url: string) => {
      const target = browserBehavior(new URL(url))
      setTimeout(() => get(target, (res) => res.resume()), 10)
    })
  }
}))

const { authorize, refresh, OAuthError } = await import('./oauth')
const { google, microsoft, parseAddress } = await import('./providers')

const realFetch = globalThis.fetch
afterEach(() => vi.unstubAllGlobals())

const cfg = {
  name: 'Google',
  authUrl: 'https://accounts.example/auth',
  tokenUrl: 'https://oauth.example/token',
  clientId: 'cid',
  clientSecret: 'secret',
  scopes: ['openid', 'email'],
  host: '127.0.0.1' as const,
  scopeOnRefresh: false
}

describe('OAuth', () => {
  it('completa el flujo con PKCE y canjea el código', async () => {
    let tokenBody = new URLSearchParams()
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init)
      tokenBody = new URLSearchParams(String(init.body))
      return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), { status: 200 })
    })
    browserBehavior = (u) => {
      expect(u.searchParams.get('code_challenge_method')).toBe('S256')
      expect(u.searchParams.get('client_id')).toBe('cid')
      return `${u.searchParams.get('redirect_uri')}/?code=CODE123&state=${u.searchParams.get('state')}`
    }
    const t = await authorize(cfg)
    expect(t.accessToken).toBe('AT')
    expect(t.refreshToken).toBe('RT')
    expect(tokenBody.get('code')).toBe('CODE123')
    expect(tokenBody.get('code_verifier')?.length).toBeGreaterThan(40)
    expect(tokenBody.get('client_secret')).toBe('secret')
  })

  it('rechaza un state distinto', async () => {
    browserBehavior = (u) => `${u.searchParams.get('redirect_uri')}/?code=X&state=otro`
    await expect(authorize(cfg)).rejects.toThrow('no es válida')
  })

  it('informa cuando el usuario cancela o el administrador lo bloquea', async () => {
    browserBehavior = (u) => `${u.searchParams.get('redirect_uri')}/?error=access_denied&error_description=Need%20admin%20approval`
    await expect(authorize(cfg)).rejects.toThrow('Need admin approval')
  })

  it('al renovar conserva el refresh token anterior y marca invalid_grant', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ access_token: 'AT2', expires_in: 3600 }), { status: 200 }))
    expect((await refresh(cfg, 'RT-viejo')).refreshToken).toBe('RT-viejo')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }))
    const err = await refresh(cfg, 'RT').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OAuthError)
    expect((err as InstanceType<typeof OAuthError>).code).toBe('invalid_grant')
  })
})

describe('Gmail y Outlook', () => {
  it('lee remitentes con y sin nombre', () => {
    expect(parseAddress('"Pérez, Juan" <Juan@X.com>')).toEqual({ name: 'Pérez, Juan', email: 'juan@x.com' })
    expect(parseAddress('a@b.com')).toEqual({ name: 'a@b.com', email: 'a@b.com' })
  })

  it('convierte la respuesta de Gmail', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url)
      if (u.includes('/labels/INBOX')) return Response.json({ messagesUnread: 7 })
      if (u.includes('/messages?')) return Response.json({ messages: [{ id: 'g1' }] })
      return Response.json({
        id: 'g1',
        threadId: 't1',
        labelIds: ['UNREAD', 'IMPORTANT'],
        snippet: 'Hola &amp; adi&#39;os',
        internalDate: '1790000000000',
        payload: { headers: [{ name: 'From', value: 'SUNAT <avisos@sunat.gob.pe>' }, { name: 'Subject', value: 'Aviso' }] }
      })
    })
    const r = await google.mail('token')
    expect(r.unreadCount).toBe(7)
    expect(r.messages[0]).toMatchObject({ id: 'g1', from: 'SUNAT', fromEmail: 'avisos@sunat.gob.pe', subject: 'Aviso', snippet: "Hola & adi'os", unread: true })
    expect(r.messages[0].link).toContain('#all/t1')
  })

  it('convierte la respuesta de Outlook y los eventos en UTC', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url)
      if (u.includes('/mailFolders/inbox?')) return Response.json({ unreadItemCount: 2 })
      if (u.includes('/messages?')) {
        return Response.json({
          value: [{ id: 'o1', conversationId: 'c1', subject: 'Clase', bodyPreview: 'Hoy', receivedDateTime: '2026-10-02T10:00:00Z', isRead: false, importance: 'high', webLink: 'https://outlook/1', from: { emailAddress: { name: 'Prof', address: 'Prof@UCBVirtual.edu.pe' } } }]
        })
      }
      return Response.json({ value: [{ id: 'e1', subject: 'Examen', isAllDay: false, start: { dateTime: '2026-10-05T14:00:00.0000000' }, end: { dateTime: '2026-10-05T16:00:00.0000000' } }] })
    })
    const r = await microsoft.mail('token')
    expect(r.messages[0]).toMatchObject({ fromEmail: 'prof@ucbvirtual.edu.pe', unread: true, labels: ['importance:high', 'UNREAD'] })
    const ev = await microsoft.calendar('token')
    expect(new Date(ev[0].start).toISOString()).toBe('2026-10-05T14:00:00.000Z')
  })

  it('explica los errores HTTP', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { message: 'Access is denied' } }, { status: 403 }))
    await expect(microsoft.mail('token')).rejects.toMatchObject({ status: 403 })
  })
})
