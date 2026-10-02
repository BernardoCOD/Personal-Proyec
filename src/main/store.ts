import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { AppData, Settings } from '@shared/types'

export function defaultSettings(): Settings {
  return {
    googleClientId: '',
    microsoftClientId: '',
    microsoftTenant: 'common',
    aiEnabled: true,
    aiModel: 'claude-opus-5-5',
    desktopNotifications: true,
    phoneNotifications: false,
    ntfyServer: 'https://ntfy.sh',
    ntfyTopic: `cdm-${randomBytes(12).toString('hex')}`,
    launchAtStartup: true,
    closeToTray: true,
    mailRefreshMinutes: 15,
    dailyDigestTime: '08:00',
    habitReminderTime: '21:00',
    notionEnabled: false,
    notionDatabaseId: '',
    backgroundMessaging: true,
    theme: 'sistema'
  }
}

function defaultData(): AppData {
  return {
    version: 1,
    accounts: [],
    activeAccountId: null,
    tasks: [],
    habits: [],
    habitLog: {},
    reflections: [],
    mail: {},
    calendar: {},
    settings: defaultSettings(),
    notified: {},
    notionLastSync: null,
    notionLastError: null,
    notionPendingArchive: []
  }
}

/**
 * Guarda todo en un archivo JSON dentro de la carpeta de datos del usuario
 * (%APPDATA%\Centro de Mando en Windows). La escritura es atómica: se escribe
 * un archivo temporal y luego se renombra, así un corte de luz no lo corrompe.
 */
export class Store {
  private data: AppData
  private readonly file: string
  private saveTimer: NodeJS.Timeout | null = null
  private listeners: (() => void)[] = []
  loadWarning: string | null = null

  constructor(dir = app.getPath('userData')) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'datos.json')
    this.data = this.load()
  }

  private load(): AppData {
    if (!existsSync(this.file)) return defaultData()
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppData>
      const base = defaultData()
      return {
        ...base,
        ...raw,
        settings: { ...base.settings, ...(raw.settings ?? {}) },
        notionPendingArchive: raw.notionPendingArchive ?? []
      }
    } catch (err) {
      const backup = `${this.file}.danado-${Date.now()}`
      renameSync(this.file, backup)
      this.loadWarning = `El archivo de datos estaba dañado. Se guardó una copia en ${backup} y se empezó de nuevo.`
      console.error(this.loadWarning, err)
      return defaultData()
    }
  }

  get(): AppData {
    return this.data
  }

  /** Cambia los datos con una función y programa el guardado. */
  update(fn: (d: AppData) => AppData | void): AppData {
    const result = fn(this.data)
    if (result) this.data = result
    this.scheduleSave()
    for (const l of this.listeners) l()
    return this.data
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 300)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }
}
