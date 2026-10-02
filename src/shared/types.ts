// Modelo de datos compartido entre el proceso principal (Electron) y la interfaz.

export type Provider = 'google' | 'microsoft'

export interface Account {
  id: string
  provider: Provider
  email: string
  /** Nombre corto que elige el usuario: "Estudios", "Trabajo", "Juegos"... */
  label: string
  color: string
  /** true cuando hay tokens OAuth guardados para leer correo y calendario. */
  connected: boolean
  createdAt: string
}

// ---------- Correo ----------

export interface MailMessage {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  /** ISO 8601 */
  date: string
  unread: boolean
  /** Etiquetas del proveedor (Gmail: IMPORTANT, CATEGORY_PROMOTIONS...; Outlook: importance). */
  labels: string[]
  /** Enlace para abrir el correo dentro de la app web. */
  link: string
}

export type MailCategory =
  | 'laboral'
  | 'educativo'
  | 'estatal'
  | 'finanzas'
  | 'personal'
  | 'promocion'
  | 'otro'

export type Importance = 'alta' | 'media' | 'baja'

export interface MailAnalysis {
  id: string
  category: MailCategory
  importance: Importance
  needsAction: boolean
  /** Qué hay que hacer, en una frase. Vacío si no requiere acción. */
  action: string
  /** YYYY-MM-DD si el correo menciona una fecha límite. */
  deadline: string | null
  summary: string
  source: 'ia' | 'reglas'
}

export interface MailDigest {
  accountId: string
  fetchedAt: string
  unreadCount: number
  messages: MailMessage[]
  analysis: Record<string, MailAnalysis>
  error?: string
  aiError?: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string
  link: string
}

export interface CalendarDigest {
  accountId: string
  fetchedAt: string
  events: CalendarEvent[]
  error?: string
}

// ---------- Tareas ----------

export type TaskStatus = 'pendiente' | 'en_progreso' | 'hecha'
export type TaskArea = 'estudio' | 'trabajo' | 'personal' | 'tramite'
export type Priority = 'alta' | 'media' | 'baja'

export interface TaskEmail {
  /** Cuenta desde la que se enviará el correo. */
  accountId: string | null
  to: string
  subject: string
  body: string
}

export interface Task {
  id: string
  title: string
  notes: string
  area: TaskArea
  priority: Priority
  status: TaskStatus
  /** YYYY-MM-DD */
  dueDate: string | null
  /** ISO 8601. Momento en que se envía el recordatorio. */
  remindAt: string | null
  /** Si existe, la tarea es "enviar un correo". */
  email: TaskEmail | null
  /** Correo del que nació la tarea (botón "Crear tarea" en un resumen). */
  source: { accountId: string; messageId: string; link: string } | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  notion: { pageId: string; syncedAt: string; hash: string } | null
}

// ---------- Hábitos ----------

export interface Habit {
  id: string
  name: string
  emoji: string
  /** YYYY-MM-DD: desde cuándo cuenta para las estadísticas. */
  startDate: string
  /** YYYY-MM-DD: último día en que contó. null = activo. */
  endDate: string | null
  order: number
}

/** Fecha YYYY-MM-DD -> ids de hábitos cumplidos ese día. */
export type HabitLog = Record<string, string[]>

export interface QuestionAnswer {
  questionId: string
  question: string
  answer: string
}

export interface ReflectionAnalysis {
  resumen: string
  fortalezas: string[]
  obstaculos: { factor: string; evidencia: string }[]
  patrones: string[]
  recomendaciones: { accion: string; porque: string }[]
  mensaje: string
  source: 'ia' | 'reglas'
}

export interface Reflection {
  id: string
  /** YYYY-MM */
  month: string
  createdAt: string
  answers: QuestionAnswer[]
  analysis: ReflectionAnalysis | null
}

// ---------- Ajustes ----------

export interface Settings {
  googleClientId: string
  microsoftClientId: string
  /** "common" acepta cuentas personales y de organizaciones (universidad). */
  microsoftTenant: string
  aiEnabled: boolean
  aiModel: string
  desktopNotifications: boolean
  phoneNotifications: boolean
  ntfyServer: string
  ntfyTopic: string
  launchAtStartup: boolean
  closeToTray: boolean
  mailRefreshMinutes: number
  /** HH:MM. Resumen diario de pendientes. */
  dailyDigestTime: string
  /** HH:MM. Aviso si faltan hábitos por marcar. */
  habitReminderTime: string
  notionEnabled: boolean
  notionDatabaseId: string
  /** Mantener WhatsApp/Instagram/Facebook cargados para ver mensajes sin leer. */
  backgroundMessaging: boolean
  theme: 'sistema' | 'claro' | 'oscuro'
}

/** Qué secretos están configurados (los valores nunca salen del proceso principal). */
export interface SecretStatus {
  anthropicApiKey: boolean
  googleClientSecret: boolean
  notionToken: boolean
  encryptionAvailable: boolean
}

export interface AppData {
  version: 1
  accounts: Account[]
  activeAccountId: string | null
  tasks: Task[]
  habits: Habit[]
  habitLog: HabitLog
  reflections: Reflection[]
  mail: Record<string, MailDigest>
  calendar: Record<string, CalendarDigest>
  settings: Settings
  /** Claves de notificaciones ya enviadas, para no repetirlas. clave -> epoch ms */
  notified: Record<string, number>
  notionLastSync: string | null
  notionLastError: string | null
  /** Páginas de Notion de tareas borradas aquí, que faltan archivar allá. */
  notionPendingArchive: string[]
}

/** Lo que la interfaz recibe: los datos más el estado de los secretos. */
export interface Snapshot {
  data: AppData
  secrets: SecretStatus
  badges: Record<string, number>
  busy: string[]
}
