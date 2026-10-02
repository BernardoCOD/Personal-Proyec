import type { Account } from './types'

// Aplicaciones que se abren dentro de Centro de Mando.
// "correo", "calendario" y "nube" dependen de la cuenta activa (Google o Microsoft).

export type ServiceId = 'correo' | 'calendario' | 'nube' | 'notion' | 'canva' | 'whatsapp' | 'instagram' | 'facebook'

export interface ServiceDef {
  id: ServiceId
  name: string
  color: string
  perAccount: boolean
  /** Apps de mensajería: se puede leer el número de no leídos del título de la página. */
  messaging: boolean
  url: (account: Account | null) => string
  summaryNote?: string
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'correo',
    name: 'Correo',
    color: '#ea4335',
    perAccount: true,
    messaging: false,
    url: (a) => (a?.provider === 'microsoft' ? 'https://outlook.office.com/mail/' : 'https://mail.google.com/mail/u/0/#inbox')
  },
  {
    id: 'calendario',
    name: 'Calendario',
    color: '#4285f4',
    perAccount: true,
    messaging: false,
    url: (a) => (a?.provider === 'microsoft' ? 'https://outlook.office.com/calendar/' : 'https://calendar.google.com/calendar/u/0/r')
  },
  {
    id: 'nube',
    name: 'Drive / OneDrive',
    color: '#34a853',
    perAccount: true,
    messaging: false,
    url: (a) => (a?.provider === 'microsoft' ? 'https://www.microsoft365.com/onedrive' : 'https://drive.google.com/drive/u/0/my-drive')
  },
  { id: 'notion', name: 'Notion', color: '#9b9a97', perAccount: false, messaging: false, url: () => 'https://www.notion.so/' },
  { id: 'canva', name: 'Canva', color: '#00c4cc', perAccount: false, messaging: false, url: () => 'https://www.canva.com/' },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    color: '#25d366',
    perAccount: false,
    messaging: true,
    url: () => 'https://web.whatsapp.com/',
    summaryNote: 'WhatsApp no permite leer tus mensajes desde otras apps, así que aquí ves cuántos tienes sin leer. Ábrelo para leerlos.'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#e1306c',
    perAccount: false,
    messaging: true,
    url: () => 'https://www.instagram.com/direct/inbox/',
    summaryNote: 'Instagram no permite leer mensajes de cuentas personales desde otras apps. Aquí ves las notificaciones pendientes.'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877f2',
    perAccount: false,
    messaging: true,
    url: () => 'https://www.facebook.com/',
    summaryNote: 'Facebook no permite leer cuentas personales desde otras apps. Aquí ves las notificaciones pendientes.'
  }
]

export function serviceById(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id)
}

/** Cada cuenta tiene su propia sesión, así puedes tener las 4 cuentas abiertas a la vez. */
export function partitionFor(service: ServiceDef, account: Account | null): string {
  return service.perAccount ? `persist:acct-${account?.id ?? 'ninguna'}` : `persist:svc-${service.id}`
}

/** "(3) WhatsApp" -> 3 */
export function unreadFromTitle(title: string): number {
  const m = /\((\d+)\+?\)/.exec(title)
  return m ? Number(m[1]) : 0
}

/** Dominios en los que se permite abrir ventanas emergentes de inicio de sesión. */
export const AUTH_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'login.microsoft.com',
  'www.facebook.com',
  'www.notion.so',
  'www.canva.com',
  'appleid.apple.com'
]

export const AI_MODELS: { id: string; label: string; effort: boolean; fallback: boolean }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (más preciso)', effort: true, fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrado, más barato)', effort: true, fallback: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (el más barato)', effort: false, fallback: false }
]

export const ACCOUNT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#64748b']
