import type { CalendarEvent, MailMessage, Provider, Settings } from '@shared/types'
import type { OAuthConfig } from './oauth'

// Lectura de correo y calendario: Gmail/Google Calendar y Outlook/Microsoft 365.
// Solo se piden permisos de LECTURA.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function apiGet<T>(url: string, token: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...headers } })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null
    const detail = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new ApiError(`${res.status} ${detail ?? res.statusText}`, res.status)
  }
  return (await res.json()) as T
}

/** Ejecuta tareas con un máximo de N a la vez (para no saturar la API). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** "Juan Pérez <juan@x.com>" -> { name, email } */
export function parseAddress(value: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value)
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() }
  const email = value.trim().toLowerCase()
  return { name: email, email }
}

const MAIL_DAYS = 7
const MAIL_MAX = 30

export interface ProviderClient {
  oauth(settings: Settings, clientSecret: string): OAuthConfig
  userEmail(token: string): Promise<string>
  mail(token: string): Promise<{ unreadCount: number; messages: MailMessage[] }>
  calendar(token: string): Promise<CalendarEvent[]>
}

// ---------------- Google ----------------

interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: { headers?: GmailHeader[] }
}

const decodeEntities = (s: string): string =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export const google: ProviderClient = {
  oauth(settings, clientSecret) {
    if (!settings.googleClientId || !clientSecret) {
      throw new Error('Falta configurar el Client ID y el Client Secret de Google en Ajustes → Cuentas.')
    }
    return {
      name: 'Google',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: settings.googleClientId,
      clientSecret,
      scopes: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      // access_type=offline + prompt=consent garantizan un refresh token.
      extraAuthParams: { access_type: 'offline', prompt: 'consent select_account' },
      host: '127.0.0.1',
      scopeOnRefresh: false
    }
  },

  async userEmail(token) {
    const u = await apiGet<{ email?: string }>('https://openidconnect.googleapis.com/v1/userinfo', token)
    return (u.email ?? '').toLowerCase()
  },

  async mail(token) {
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me'
    const q = encodeURIComponent(`in:inbox newer_than:${MAIL_DAYS}d`)
    const [list, inbox] = await Promise.all([
      apiGet<{ messages?: { id: string }[] }>(`${base}/messages?maxResults=${MAIL_MAX}&q=${q}`, token),
      apiGet<{ messagesUnread?: number }>(`${base}/labels/INBOX`, token)
    ])
    const ids = (list.messages ?? []).map((m) => m.id)
    const fields = ['From', 'Subject', 'Date'].map((h) => `metadataHeaders=${h}`).join('&')
    const full = await mapLimit(ids, 5, (id) => apiGet<GmailMessage>(`${base}/messages/${id}?format=metadata&${fields}`, token))
    const messages = full.map((m): MailMessage => {
      const header = (n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''
      const from = parseAddress(header('From'))
      const labels = m.labelIds ?? []
      return {
        id: m.id,
        threadId: m.threadId,
        from: from.name,
        fromEmail: from.email,
        subject: header('Subject') || '(sin asunto)',
        snippet: decodeEntities(m.snippet ?? ''),
        date: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
        unread: labels.includes('UNREAD'),
        labels,
        link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`
      }
    })
    return { unreadCount: inbox.messagesUnread ?? messages.filter((m) => m.unread).length, messages }
  },

  async calendar(token) {
    const now = new Date()
    const end = new Date(now.getTime() + 7 * 86_400_000)
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '25'
    })
    type GEvent = {
      id: string
      summary?: string
      location?: string
      htmlLink?: string
      status?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }
    const res = await apiGet<{ items?: GEvent[] }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token)
    return (res.items ?? [])
      .filter((e) => e.status !== 'cancelled')
      .map((e) => ({
        id: e.id,
        title: e.summary ?? '(sin título)',
        start: e.start?.dateTime ?? e.start?.date ?? '',
        end: e.end?.dateTime ?? e.end?.date ?? '',
        allDay: !e.start?.dateTime,
        location: e.location ?? '',
        link: e.htmlLink ?? 'https://calendar.google.com/'
      }))
  }
}

// ---------------- Microsoft ----------------

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  receivedDateTime?: string
  isRead?: boolean
  importance?: string
  webLink?: string
  inferenceClassification?: string
  from?: { emailAddress?: { name?: string; address?: string } }
}

const GRAPH = 'https://graph.microsoft.com/v1.0'

export const microsoft: ProviderClient = {
  oauth(settings) {
    if (!settings.microsoftClientId) {
      throw new Error('Falta configurar el Client ID de Microsoft en Ajustes → Cuentas.')
    }
    const tenant = settings.microsoftTenant || 'common'
    return {
      name: 'Microsoft',
      authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      clientId: settings.microsoftClientId,
      scopes: ['openid', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read'],
      extraAuthParams: { prompt: 'select_account' },
      host: 'localhost',
      scopeOnRefresh: true
    }
  },

  async userEmail(token) {
    const me = await apiGet<{ mail?: string; userPrincipalName?: string }>(`${GRAPH}/me?$select=mail,userPrincipalName`, token)
    return (me.mail ?? me.userPrincipalName ?? '').toLowerCase()
  },

  async mail(token) {
    const since = new Date(Date.now() - MAIL_DAYS * 86_400_000).toISOString()
    const params = new URLSearchParams({
      $top: String(MAIL_MAX),
      $select: 'id,conversationId,subject,bodyPreview,receivedDateTime,isRead,importance,webLink,from,inferenceClassification',
      $filter: `receivedDateTime ge ${since}`,
      $orderby: 'receivedDateTime desc'
    })
    const [list, inbox] = await Promise.all([
      apiGet<{ value?: GraphMessage[] }>(`${GRAPH}/me/mailFolders/inbox/messages?${params}`, token),
      apiGet<{ unreadItemCount?: number }>(`${GRAPH}/me/mailFolders/inbox?$select=unreadItemCount`, token)
    ])
    const messages = (list.value ?? []).map((m): MailMessage => {
      const labels: string[] = []
      if (m.importance === 'high') labels.push('importance:high')
      if (m.inferenceClassification === 'other') labels.push('CATEGORY_PROMOTIONS')
      if (!m.isRead) labels.push('UNREAD')
      const address = (m.from?.emailAddress?.address ?? '').toLowerCase()
      return {
        id: m.id,
        threadId: m.conversationId ?? m.id,
        from: m.from?.emailAddress?.name || address,
        fromEmail: address,
        subject: m.subject || '(sin asunto)',
        snippet: m.bodyPreview ?? '',
        date: m.receivedDateTime ?? new Date().toISOString(),
        unread: !m.isRead,
        labels,
        link: m.webLink ?? 'https://outlook.office.com/mail/'
      }
    })
    return { unreadCount: inbox.unreadItemCount ?? messages.filter((m) => m.unread).length, messages }
  },

  async calendar(token) {
    const now = new Date()
    const end = new Date(now.getTime() + 7 * 86_400_000)
    const params = new URLSearchParams({
      startDateTime: now.toISOString(),
      endDateTime: end.toISOString(),
      $orderby: 'start/dateTime',
      $top: '25',
      $select: 'id,subject,start,end,isAllDay,location,webLink,isCancelled'
    })
    type MEvent = {
      id: string
      subject?: string
      isAllDay?: boolean
      isCancelled?: boolean
      webLink?: string
      location?: { displayName?: string }
      start?: { dateTime?: string }
      end?: { dateTime?: string }
    }
    // Pedimos las horas en UTC para convertirlas bien a la hora local.
    const res = await apiGet<{ value?: MEvent[] }>(`${GRAPH}/me/calendarView?${params}`, token, {
      Prefer: 'outlook.timezone="UTC"'
    })
    const utc = (s?: string) => (s ? (s.endsWith('Z') ? s : `${s}Z`) : '')
    return (res.value ?? [])
      .filter((e) => !e.isCancelled)
      .map((e) => ({
        id: e.id,
        title: e.subject ?? '(sin título)',
        start: e.isAllDay ? (e.start?.dateTime ?? '').slice(0, 10) : utc(e.start?.dateTime),
        end: e.isAllDay ? (e.end?.dateTime ?? '').slice(0, 10) : utc(e.end?.dateTime),
        allDay: Boolean(e.isAllDay),
        location: e.location?.displayName ?? '',
        link: e.webLink ?? 'https://outlook.office.com/calendar/'
      }))
  }
}

export function clientFor(provider: Provider): ProviderClient {
  return provider === 'google' ? google : microsoft
}
