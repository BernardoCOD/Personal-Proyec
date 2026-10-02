import type { MailAnalysis, MailCategory, MailMessage, Importance } from './types'

// Clasificación por reglas. Se usa cuando la IA está apagada o falla,
// y como respaldo para correos que la IA aún no analizó.

const STATE_PATTERNS = [
  /\.gob\.[a-z]{2}$/i, // gob.pe, gob.mx, gob.ar...
  /\.gov(\.[a-z]{2})?$/i,
  /\.mil\.[a-z]{2}$/i,
  /munlima|muni[a-z]*\.|municipalidad/i,
  /sunat|reniec|essalud|indecopi|migraciones|sunarp|pnp|mininter|minedu|osce|sutran|sat\.gob/i,
  /poder\s*judicial|pj\.gob|fiscalia|mpfn/i
]

const STATE_SUBJECT = /(denuncia|notificaci[oó]n|resoluci[oó]n|expediente|multa|tr[aá]mite|citaci[oó]n|municipal|tribut)/i
const EDU_DOMAIN = /(\.edu(\.[a-z]{2})?$)|ucbvirtual|classroom\.google|moodle|canvas|blackboard/i
const EDU_SUBJECT = /(tarea|examen|clase|curso|matr[ií]cula|nota|calificaci|s[ií]labo|docente|profesor|pr[aá]ctica|entrega)/i
const WORK_SUBJECT = /(reuni[oó]n|propuesta|cotizaci[oó]n|contrato|factura|informe|proyecto|entrevista|cliente|postulaci[oó]n|cv|curr[ií]culum)/i
const FIN_PATTERNS = /(banco|bcp|interbank|bbva|scotiabank|yape|plin|paypal|visa|mastercard|estado de cuenta|pago|cobro|transferencia)/i
const ACTION_SUBJECT = /(urgente|importante|responder|confirmar|pendiente|plazo|vence|venc|fecha l[ií]mite|recordatorio|acci[oó]n requerida|action required|firmar|subsanar|presentar)/i
const PROMO_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS']
const NO_REPLY = /(no-?reply|noreply|notifications?@|newsletter|mailer|marketing)/i

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).toLowerCase()
}

export function categorize(m: MailMessage): MailCategory {
  const domain = domainOf(m.fromEmail)
  const text = `${m.subject} ${m.from}`
  if (STATE_PATTERNS.some((p) => p.test(domain) || p.test(m.from))) return 'estatal'
  if (EDU_DOMAIN.test(domain)) return 'educativo'
  if (m.labels.some((l) => PROMO_LABELS.includes(l))) return 'promocion'
  if (FIN_PATTERNS.test(text)) return 'finanzas'
  if (STATE_SUBJECT.test(m.subject) && !NO_REPLY.test(m.fromEmail)) return 'estatal'
  if (EDU_SUBJECT.test(m.subject)) return 'educativo'
  if (WORK_SUBJECT.test(m.subject)) return 'laboral'
  if (NO_REPLY.test(m.fromEmail)) return 'otro'
  return 'personal'
}

export function ruleAnalysis(m: MailMessage): MailAnalysis {
  const category = categorize(m)
  const flaggedImportant = m.labels.includes('IMPORTANT') || m.labels.includes('importance:high')
  const actionWords = ACTION_SUBJECT.test(m.subject) || ACTION_SUBJECT.test(m.snippet)
  const fromAutomated = NO_REPLY.test(m.fromEmail)

  let importance: Importance = 'baja'
  if (category === 'estatal' || (actionWords && category !== 'promocion')) importance = 'alta'
  else if (flaggedImportant || category === 'educativo' || category === 'laboral') importance = 'media'
  if (category === 'promocion') importance = 'baja'

  const needsAction =
    category !== 'promocion' && (actionWords || category === 'estatal' || (!fromAutomated && (category === 'laboral' || category === 'educativo')))

  return {
    id: m.id,
    category,
    importance,
    needsAction,
    action: needsAction ? 'Revisar y responder si corresponde.' : '',
    deadline: null,
    summary: m.snippet.slice(0, 160),
    source: 'reglas'
  }
}

export const CATEGORY_LABEL: Record<MailCategory, string> = {
  laboral: 'Laboral',
  educativo: 'Educativo',
  estatal: 'Estatal',
  finanzas: 'Finanzas',
  personal: 'Personal',
  promocion: 'Promoción',
  otro: 'Otro'
}

const IMPORTANCE_ORDER: Record<Importance, number> = { alta: 0, media: 1, baja: 2 }

/** Divide los correos en "por hacer" y "sin acción", con los importantes primero. */
export function splitByAction(
  messages: MailMessage[],
  analysis: Record<string, MailAnalysis>
): { todo: { m: MailMessage; a: MailAnalysis }[]; rest: { m: MailMessage; a: MailAnalysis }[] } {
  const rows = messages.map((m) => ({ m, a: analysis[m.id] ?? ruleAnalysis(m) }))
  rows.sort((x, y) => IMPORTANCE_ORDER[x.a.importance] - IMPORTANCE_ORDER[y.a.importance] || (x.m.date < y.m.date ? 1 : -1))
  return { todo: rows.filter((r) => r.a.needsAction), rest: rows.filter((r) => !r.a.needsAction) }
}
