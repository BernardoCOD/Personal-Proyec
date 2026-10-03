import { shell } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Api, SecretName, TaskInput } from '@shared/api'
import type { Account, AppData, MailAnalysis, MailDigest, QuestionAnswer, Reflection, Settings, Snapshot, Task } from '@shared/types'
import { addDays, isDateKey, minutesOfDay, parseTime, toDateKey } from '@shared/dates'
import { activeHabitsOn, monthStats, scoreDay, toggleHabit } from '@shared/habits'
import { dueReminders, isOpen, isOverdue, newTask, reminderKey, updateTask } from '@shared/tasks'
import { ruleAnalysis } from '@shared/classify'
import { ruleBasedAnalysis } from '@shared/questionnaire'
import { parseNotionId } from '@shared/notionMap'
import { ACCOUNT_COLORS } from '@shared/services'
import type { Store } from './store'
import type { Secrets } from './secrets'
import type { Notifier } from './notify'
import { authorize, OAuthError, refresh } from './oauth'
import { ApiError, clientFor } from './providers'
import { analyzeMail, analyzeReflection, testKey, type AiConfig } from './ai'
import { GeminiError } from './gemini'
import { createDatabase, syncTasks } from './notion'

const AI_BATCH = 25
const NOTION_EVERY_MS = 5 * 60_000
const DAY_MS = 86_400_000

export class Controller implements Api {
  private badges: Record<string, number> = {}
  private busy = new Set<string>()
  private tokenRequests = new Map<string, Promise<string>>()
  private lastRefresh = new Map<string, number>()
  private lastNotionSync = 0
  private notionRunning: Promise<string> | null = null
  /** Tras alcanzar el límite gratuito de la IA, se espera antes de volver a llamarla. */
  private aiPausedUntil = 0
  /** Las consultas a la IA van de una en una para no chocar con el límite por minuto del plan gratuito. */
  private aiQueue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: Store,
    private readonly secrets: Secrets,
    private readonly notifier: Notifier,
    private readonly emit: () => void,
    private readonly onSettingsChanged: (s: Settings) => void
  ) {}

  private get data(): AppData {
    return this.store.get()
  }

  private async withBusy<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.busy.add(key)
    this.emit()
    try {
      return await fn()
    } finally {
      this.busy.delete(key)
      this.emit()
    }
  }

  /** Configuración de la IA elegida en Ajustes, o null si falta la clave. */
  private aiConfig(requireEnabled = true): AiConfig | null {
    const s = this.data.settings
    if (requireEnabled && !s.aiEnabled) return null
    const gemini = s.aiProvider === 'gemini'
    const apiKey = this.secrets.get(gemini ? 'geminiApiKey' : 'anthropicApiKey')
    if (!apiKey) return null
    return {
      provider: s.aiProvider,
      apiKey,
      model: gemini ? s.geminiModel : s.aiModel,
      onModelChange: (model) =>
        this.store.update((d) => {
          d.settings = { ...d.settings, geminiModel: model }
        })
    }
  }

  private inAiQueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.aiQueue.then(fn, fn)
    this.aiQueue = run.catch(() => undefined)
    return run
  }

  private noteAiError(err: unknown): void {
    if (err instanceof GeminiError && err.status === 429) this.aiPausedUntil = Date.now() + 60 * 60_000
  }

  snapshotSync(): Snapshot {
    return { data: this.data, secrets: this.secrets.status(), badges: { ...this.badges }, busy: [...this.busy] }
  }

  async getSnapshot(): Promise<Snapshot> {
    return this.snapshotSync()
  }

  // ---------------- Cuentas ----------------

  private account(id: string): Account {
    const a = this.data.accounts.find((x) => x.id === id)
    if (!a) throw new Error('La cuenta no existe.')
    return a
  }

  private patchAccount(id: string, changes: Partial<Account>): void {
    this.store.update((d) => {
      d.accounts = d.accounts.map((a) => (a.id === id ? { ...a, ...changes } : a))
    })
  }

  async addAccount(input: { provider: Account['provider']; email: string; label: string; color: string }): Promise<Account> {
    const label = input.label.trim()
    if (!label) throw new Error('Ponle un nombre a la cuenta (por ejemplo "Estudios").')
    const account: Account = {
      id: randomUUID(),
      provider: input.provider,
      email: input.email.trim().toLowerCase(),
      label,
      color: input.color || ACCOUNT_COLORS[this.data.accounts.length % ACCOUNT_COLORS.length],
      connected: false,
      createdAt: new Date().toISOString()
    }
    this.store.update((d) => {
      d.accounts.push(account)
      if (!d.activeAccountId) d.activeAccountId = account.id
    })
    return account
  }

  private oauthConfig(account: Account) {
    return clientFor(account.provider).oauth(this.data.settings, this.secrets.get('googleClientSecret'))
  }

  async connectAccount(accountId: string): Promise<Account> {
    const account = this.account(accountId)
    return this.withBusy(`cuenta:${accountId}`, async () => {
      const tokens = await authorize(this.oauthConfig(account))
      if (!tokens.refreshToken) {
        throw new Error('El proveedor no entregó un permiso permanente. Quita el acceso de "Centro de Mando" en tu cuenta y vuelve a conectar.')
      }
      const email = await clientFor(account.provider).userEmail(tokens.accessToken)
      this.secrets.setTokens(accountId, tokens)
      this.patchAccount(accountId, { connected: true, email: email || account.email })
      void this.refreshAccount(accountId).catch(() => undefined)
      return this.account(accountId)
    })
  }

  async disconnectAccount(accountId: string): Promise<void> {
    this.secrets.setTokens(accountId, null)
    this.patchAccount(accountId, { connected: false })
  }

  async updateAccount(accountId: string, changes: Partial<Pick<Account, 'label' | 'color' | 'email'>>): Promise<void> {
    this.account(accountId)
    const clean: Partial<Account> = {}
    if (changes.label !== undefined) clean.label = changes.label.trim() || this.account(accountId).label
    if (changes.color !== undefined) clean.color = changes.color
    if (changes.email !== undefined) clean.email = changes.email.trim().toLowerCase()
    this.patchAccount(accountId, clean)
  }

  async removeAccount(accountId: string): Promise<void> {
    this.secrets.setTokens(accountId, null)
    this.store.update((d) => {
      d.accounts = d.accounts.filter((a) => a.id !== accountId)
      delete d.mail[accountId]
      delete d.calendar[accountId]
      if (d.activeAccountId === accountId) d.activeAccountId = d.accounts[0]?.id ?? null
      d.tasks = d.tasks.map((t) => (t.email?.accountId === accountId ? { ...t, email: { ...t.email, accountId: null } } : t))
    })
  }

  async setActiveAccount(accountId: string): Promise<void> {
    this.account(accountId)
    this.store.update((d) => {
      d.activeAccountId = accountId
    })
  }

  /** Token de acceso vigente; lo renueva si está por vencer. */
  private token(account: Account): Promise<string> {
    const pending = this.tokenRequests.get(account.id)
    if (pending) return pending
    const p = (async () => {
      const t = this.secrets.getTokens(account.id)
      if (!t) throw new Error('La cuenta no está conectada.')
      if (t.expiresAt - 60_000 > Date.now()) return t.accessToken
      try {
        const fresh = await refresh(this.oauthConfig(account), t.refreshToken)
        this.secrets.setTokens(account.id, fresh)
        return fresh.accessToken
      } catch (err) {
        if (err instanceof OAuthError && (err.code === 'invalid_grant' || err.code === 'unauthorized_client')) {
          this.secrets.setTokens(account.id, null)
          this.patchAccount(account.id, { connected: false })
          throw new Error('El permiso de la cuenta venció o se revocó. Vuelve a conectarla en Ajustes → Cuentas.')
        }
        throw err
      }
    })().finally(() => this.tokenRequests.delete(account.id))
    this.tokenRequests.set(account.id, p)
    return p
  }

  async refreshAccount(accountId?: string): Promise<void> {
    const targets = this.data.accounts.filter((a) => a.connected && (!accountId || a.id === accountId))
    await Promise.all(targets.map((a) => this.refreshOne(a)))
  }

  private async refreshOne(account: Account): Promise<void> {
    const key = `cuenta:${account.id}`
    if (this.busy.has(key)) return
    this.lastRefresh.set(account.id, Date.now())
    await this.withBusy(key, async () => {
      const client = clientFor(account.provider)
      const previous = this.data.mail[account.id]
      const now = new Date().toISOString()
      let token: string
      try {
        token = await this.token(account)
      } catch (err) {
        this.saveMail(account.id, { ...(previous ?? emptyDigest(account.id)), error: message(err) })
        return
      }

      const [mail, calendar] = await Promise.allSettled([client.mail(token), client.calendar(token)])

      this.store.update((d) => {
        d.calendar[account.id] =
          calendar.status === 'fulfilled'
            ? { accountId: account.id, fetchedAt: now, events: calendar.value }
            : { ...(d.calendar[account.id] ?? { accountId: account.id, fetchedAt: now, events: [] }), error: apiMessage(calendar.reason) }
      })

      if (mail.status === 'rejected') {
        this.saveMail(account.id, { ...(previous ?? emptyDigest(account.id)), error: apiMessage(mail.reason) })
        return
      }

      const ids = new Set(mail.value.messages.map((m) => m.id))
      const analysis: Record<string, MailAnalysis> = {}
      for (const [id, a] of Object.entries(previous?.analysis ?? {})) if (ids.has(id)) analysis[id] = a

      const digest: MailDigest = {
        accountId: account.id,
        fetchedAt: now,
        unreadCount: mail.value.unreadCount,
        messages: mail.value.messages,
        analysis
      }

      const ai = this.aiConfig()
      const pending = mail.value.messages.filter((m) => !analysis[m.id]).slice(0, AI_BATCH)
      if (ai && pending.length > 0 && Date.now() >= this.aiPausedUntil) {
        try {
          for (const a of await this.inAiQueue(() => analyzeMail(ai, pending, toDateKey(new Date())))) analysis[a.id] = a
        } catch (err) {
          this.noteAiError(err)
          digest.aiError = message(err)
        }
      }

      this.saveMail(account.id, digest)
      await this.notifyImportantMail(account, digest, previous === undefined)
    })
  }

  private saveMail(accountId: string, digest: MailDigest): void {
    this.store.update((d) => {
      if (d.accounts.some((a) => a.id === accountId)) d.mail[accountId] = digest
    })
  }

  private async notifyImportantMail(account: Account, digest: MailDigest, firstLoad: boolean): Promise<void> {
    const cutoff = Date.now() - DAY_MS
    const important = digest.messages.filter((m) => {
      const a = digest.analysis[m.id] ?? ruleAnalysis(m)
      return m.unread && a.importance === 'alta' && a.needsAction && new Date(m.date).getTime() > cutoff
    })
    const fresh = important.filter((m) => !this.data.notified[`mail:${account.id}:${m.id}`])
    if (fresh.length === 0) return
    this.store.update((d) => {
      for (const m of fresh) d.notified[`mail:${account.id}:${m.id}`] = Date.now()
    })
    // La primera vez que se conecta una cuenta no se avisa de correos viejos.
    if (firstLoad) return
    if (fresh.length === 1) {
      const m = fresh[0]
      const a = digest.analysis[m.id] ?? ruleAnalysis(m)
      await this.notifier.send({
        title: `📩 Correo importante · ${account.label}`,
        body: `${m.from}: ${m.subject}${a.action ? `\n${a.action}` : ''}`,
        view: 'servicio:correo',
        priority: 4,
        tags: ['email']
      })
    } else {
      await this.notifier.send({
        title: `📩 ${fresh.length} correos importantes · ${account.label}`,
        body: fresh.slice(0, 3).map((m) => `• ${m.subject}`).join('\n'),
        view: 'servicio:correo',
        priority: 4,
        tags: ['email']
      })
    }
  }

  // ---------------- Tareas ----------------

  async saveTask(input: TaskInput): Promise<Task> {
    const title = input.title?.trim()
    if (!title) throw new Error('La tarea necesita un título.')
    if (input.dueDate && !isDateKey(input.dueDate)) throw new Error('La fecha no es válida.')
    if (input.remindAt && Number.isNaN(new Date(input.remindAt).getTime())) throw new Error('La hora del recordatorio no es válida.')
    if (input.email && input.email.to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.to.split(/[,;]/)[0].trim())) {
      throw new Error('El correo del destinatario no es válido.')
    }
    const now = new Date()
    const existing = input.id ? this.data.tasks.find((t) => t.id === input.id) : undefined
    // Campos que solo controla la app (no se aceptan desde la interfaz).
    const changes: Partial<Task> = { ...input }
    for (const k of ['id', 'createdAt', 'updatedAt', 'completedAt', 'notion'] as const) delete changes[k]
    const task = existing ? updateTask(existing, { ...changes, title }, now) : newTask({ ...changes, title }, now, randomUUID())
    this.store.update((d) => {
      d.tasks = existing ? d.tasks.map((t) => (t.id === task.id ? task : t)) : [...d.tasks, task]
    })
    return task
  }

  async deleteTask(taskId: string): Promise<void> {
    this.store.update((d) => {
      const t = d.tasks.find((x) => x.id === taskId)
      if (t?.notion) d.notionPendingArchive = [...d.notionPendingArchive, t.notion.pageId]
      d.tasks = d.tasks.filter((x) => x.id !== taskId)
    })
  }

  // ---------------- Hábitos ----------------

  async saveHabit(input: { id?: string; name: string; emoji: string }): Promise<AppData['habits'][number]> {
    const name = input.name.trim()
    if (!name) throw new Error('El hábito necesita un nombre.')
    const today = toDateKey(new Date())
    let saved = this.data.habits.find((h) => h.id === input.id)
    if (saved) {
      saved = { ...saved, name, emoji: input.emoji || saved.emoji }
      const updated = saved
      this.store.update((d) => {
        d.habits = d.habits.map((h) => (h.id === updated.id ? updated : h))
      })
      return updated
    }
    const habit = {
      id: randomUUID(),
      name,
      emoji: input.emoji || '✅',
      startDate: today,
      endDate: null,
      order: Math.max(-1, ...this.data.habits.map((h) => h.order)) + 1
    }
    this.store.update((d) => {
      d.habits.push(habit)
    })
    return habit
  }

  async archiveHabit(habitId: string): Promise<void> {
    const today = toDateKey(new Date())
    const yesterday = addDays(today, -1)
    this.store.update((d) => {
      const h = d.habits.find((x) => x.id === habitId)
      if (!h) return
      if (h.startDate > yesterday) {
        // Se creó hoy: no tiene historial, se elimina del todo.
        d.habits = d.habits.filter((x) => x.id !== habitId)
        for (const date of Object.keys(d.habitLog)) {
          const rest = d.habitLog[date].filter((id) => id !== habitId)
          if (rest.length) d.habitLog[date] = rest
          else delete d.habitLog[date]
        }
      } else {
        h.endDate = yesterday
        if (d.habitLog[today]) {
          const rest = d.habitLog[today].filter((id) => id !== habitId)
          if (rest.length) d.habitLog[today] = rest
          else delete d.habitLog[today]
        }
      }
    })
  }

  async moveHabit(habitId: string, direction: -1 | 1): Promise<void> {
    const active = activeHabitsOn(this.data.habits, toDateKey(new Date()))
    const i = active.findIndex((h) => h.id === habitId)
    const j = i + direction
    if (i === -1 || j < 0 || j >= active.length) return
    const a = active[i]
    const b = active[j]
    this.store.update((d) => {
      d.habits = d.habits.map((h) => (h.id === a.id ? { ...h, order: b.order } : h.id === b.id ? { ...h, order: a.order } : h))
    })
  }

  async toggleHabit(date: string, habitId: string): Promise<void> {
    const today = toDateKey(new Date())
    if (!isDateKey(date) || date > today) throw new Error('Solo puedes marcar hábitos de hoy o de días pasados.')
    const habit = this.data.habits.find((h) => h.id === habitId)
    if (!habit || !activeHabitsOn([habit], date).length) throw new Error('Ese hábito no estaba activo ese día.')
    this.store.update((d) => {
      d.habitLog = toggleHabit(d.habitLog, date, habitId)
    })
  }

  async saveReflection(month: string, answers: QuestionAnswer[]): Promise<Reflection> {
    const m = /^(\d{4})-(\d{2})$/.exec(month)
    if (!m) throw new Error('Mes no válido.')
    const stats = monthStats(this.data.habits, this.data.habitLog, Number(m[1]), Number(m[2]), toDateKey(new Date()))
    if (stats.countedDays === 0) throw new Error('Todavía no hay días registrados en ese mes.')
    const ai = this.aiConfig()

    const analysis = await this.withBusy('reflexion', async () => {
      if (ai) {
        try {
          return await this.inAiQueue(() => analyzeReflection(ai, stats, answers))
        } catch (err) {
          this.noteAiError(err)
          const fallback = ruleBasedAnalysis(stats, answers)
          return { ...fallback, resumen: `${fallback.resumen} (La IA no respondió: ${message(err)})` }
        }
      }
      return ruleBasedAnalysis(stats, answers)
    })

    const reflection: Reflection = { id: randomUUID(), month, createdAt: new Date().toISOString(), answers, analysis }
    this.store.update((d) => {
      d.reflections = [reflection, ...d.reflections]
    })
    return reflection
  }

  // ---------------- Ajustes ----------------

  async updateSettings(changes: Partial<Settings>): Promise<void> {
    const next: Settings = { ...this.data.settings, ...changes }
    for (const key of ['dailyDigestTime', 'habitReminderTime'] as const) {
      if (parseTime(next[key]) === null) throw new Error('La hora debe tener el formato HH:MM (por ejemplo 08:00).')
    }
    next.mailRefreshMinutes = Math.min(240, Math.max(5, Math.round(Number(next.mailRefreshMinutes) || 15)))
    next.ntfyTopic = next.ntfyTopic.trim()
    if (next.ntfyTopic && !/^[A-Za-z0-9_-]{6,64}$/.test(next.ntfyTopic)) {
      throw new Error('El tema de ntfy solo puede tener letras, números, guiones y _ (6 a 64 caracteres).')
    }
    if (changes.notionDatabaseId !== undefined && changes.notionDatabaseId.trim()) {
      const id = parseNotionId(changes.notionDatabaseId)
      if (!id) throw new Error('No reconozco ese enlace o id de Notion.')
      next.notionDatabaseId = id
    }
    this.store.update((d) => {
      d.settings = next
    })
    this.onSettingsChanged(next)
  }

  async setSecret(name: SecretName, value: string): Promise<void> {
    this.secrets.set(name, value)
    this.emit()
  }

  async testAi(): Promise<string> {
    const ai = this.aiConfig(false)
    if (!ai) throw new Error(`Primero guarda la API key de ${this.data.settings.aiProvider === 'gemini' ? 'Gemini' : 'Anthropic'}.`)
    const reply = await this.inAiQueue(() => testKey(ai))
    this.aiPausedUntil = 0
    return reply
  }

  async testNotification(): Promise<void> {
    const s = this.data.settings
    await this.notifier.send({ title: 'Centro de Mando', body: '¡Las notificaciones funcionan! 🎉', phone: false })
    if (s.phoneNotifications) {
      await this.notifier.sendPhone(s, { title: 'Centro de Mando', body: '¡Las notificaciones al celular funcionan! 🎉', tags: ['tada'] })
    }
  }

  async notionCreateDatabase(parentPageUrl: string): Promise<string> {
    const token = this.secrets.get('notionToken')
    if (!token) throw new Error('Primero guarda el token de tu integración de Notion.')
    const parent = parseNotionId(parentPageUrl)
    if (!parent) throw new Error('Pega el enlace de una página de Notion (Compartir → Copiar enlace).')
    const id = await createDatabase(token, parent)
    this.store.update((d) => {
      d.settings = { ...d.settings, notionDatabaseId: id, notionEnabled: true }
    })
    void this.notionSyncNow().catch(() => undefined)
    return id
  }

  notionSyncNow(): Promise<string> {
    if (this.notionRunning) return this.notionRunning
    this.notionRunning = this.withBusy('notion', () => this.runNotionSync()).finally(() => {
      this.notionRunning = null
    })
    return this.notionRunning
  }

  private async runNotionSync(): Promise<string> {
    this.lastNotionSync = Date.now()
    const s = this.data.settings
    const token = this.secrets.get('notionToken')
    if (!token || !s.notionDatabaseId) throw new Error('Configura el token y la base de datos de Notion en Ajustes.')
    const before = this.data
    const beforeTasks = new Map(before.tasks.map((t) => [t.id, t]))
    try {
      const result = await syncTasks(token, s.notionDatabaseId, before)
      this.store.update((d) => {
        const current = new Map(d.tasks.map((t) => [t.id, t]))
        for (const up of result.upserts) {
          const was = beforeTasks.get(up.id)
          const now = current.get(up.id)
          if (was && !now) continue // se borró mientras se sincronizaba
          if (was && now && now.updatedAt !== was.updatedAt && up.notion) {
            // Cambió durante la sincronización: se guarda el enlace y se sube en la próxima.
            current.set(up.id, { ...now, notion: { pageId: up.notion.pageId, syncedAt: '', hash: up.notion.hash } })
            continue
          }
          current.set(up.id, up)
        }
        for (const id of result.deletes) {
          const was = beforeTasks.get(id)
          const now = current.get(id)
          if (was && now && now.updatedAt === was.updatedAt) current.delete(id)
        }
        d.tasks = [...current.values()]
        d.notionPendingArchive = d.notionPendingArchive.filter((p) => !result.archived.includes(p))
        d.notionLastSync = new Date().toISOString()
        d.notionLastError = null
      })
      return result.summary
    } catch (err) {
      this.store.update((d) => {
        d.notionLastError = message(err)
      })
      throw err
    }
  }

  async setBadge(key: string, count: number): Promise<void> {
    const n = Math.max(0, Math.floor(count) || 0)
    if (this.badges[key] === n) return
    this.badges[key] = n
    this.emit()
  }

  async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new Error('Solo se pueden abrir enlaces web.')
    await shell.openExternal(url)
  }

  // ---------------- Tareas periódicas ----------------

  /** Se ejecuta cada 30 segundos. */
  async tick(now = new Date()): Promise<void> {
    const d = this.data
    const s = d.settings

    for (const t of dueReminders(d.tasks, now, d.notified)) {
      this.store.update((x) => {
        x.notified[reminderKey(t)] = now.getTime()
      })
      const body = t.email
        ? `✉️ Enviar correo a ${t.email.to || '(sin destinatario)'}${t.email.subject ? `: ${t.email.subject}` : ''}`
        : t.notes || 'Tienes esta tarea pendiente.'
      await this.notifier.send({ title: `⏰ ${t.title}`, body, view: 'tareas', priority: t.priority === 'alta' ? 5 : 4, tags: ['alarm_clock'] })
    }

    const today = toDateKey(now)
    const minute = minutesOfDay(now)

    const digestAt = parseTime(s.dailyDigestTime)
    const digestKey = `digest:${today}`
    if (digestAt !== null && minute >= digestAt && minute < digestAt + 180 && !d.notified[digestKey]) {
      this.store.update((x) => {
        x.notified[digestKey] = now.getTime()
      })
      const open = d.tasks.filter(isOpen)
      const overdue = open.filter((t) => isOverdue(t, today)).length
      const dueToday = open.filter((t) => t.dueDate === today).length
      const emails = open.filter((t) => t.email).length
      const mailTodo = Object.values(d.mail).reduce(
        (n, dg) => n + dg.messages.filter((m) => m.unread && (dg.analysis[m.id] ?? ruleAnalysis(m)).needsAction).length,
        0
      )
      const parts = [
        `${dueToday} tarea(s) para hoy`,
        overdue ? `${overdue} vencida(s)` : '',
        emails ? `${emails} correo(s) por enviar` : '',
        mailTodo ? `${mailTodo} correo(s) por atender` : ''
      ].filter(Boolean)
      await this.notifier.send({ title: '☀️ Tu día', body: parts.join(' · '), view: 'inicio', tags: ['sunny'] })
    }

    const habitAt = parseTime(s.habitReminderTime)
    const habitKey = `habitos:${today}`
    if (habitAt !== null && minute >= habitAt && !d.notified[habitKey]) {
      this.store.update((x) => {
        x.notified[habitKey] = now.getTime()
      })
      const score = scoreDay(d.habits, d.habitLog, today, today)
      if (score.total > 0 && score.done < score.total) {
        await this.notifier.send({
          title: '🔥 Hábitos de hoy',
          body: `Llevas ${score.done} de ${score.total}. ¡Aún puedes completar el día!`,
          view: 'habitos',
          tags: ['fire']
        })
      }
    }

    const every = s.mailRefreshMinutes * 60_000
    for (const a of d.accounts) {
      if (a.connected && Date.now() - (this.lastRefresh.get(a.id) ?? 0) >= every) {
        void this.refreshOne(a).catch((err: unknown) => console.error('Error al actualizar cuenta', err))
      }
    }

    if (s.notionEnabled && s.notionDatabaseId && this.secrets.get('notionToken') && Date.now() - this.lastNotionSync >= NOTION_EVERY_MS) {
      void this.notionSyncNow().catch((err: unknown) => console.error('Error al sincronizar Notion', err))
    }

    // Limpieza de avisos viejos (60 días).
    const old = Object.entries(d.notified).filter(([, ts]) => now.getTime() - ts > 60 * DAY_MS)
    if (old.length > 0) {
      this.store.update((x) => {
        for (const [k] of old) delete x.notified[k]
      })
    }
  }
}

function emptyDigest(accountId: string): MailDigest {
  return { accountId, fetchedAt: new Date().toISOString(), unreadCount: 0, messages: [], analysis: {} }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function apiMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'El permiso expiró. Vuelve a conectar la cuenta.'
    if (err.status === 403) return 'El proveedor negó el acceso (403). Si es tu correo de la universidad, puede que el administrador bloquee apps externas.'
    if (err.status === 429) return 'Demasiadas consultas; se reintentará más tarde.'
  }
  return message(err)
}
