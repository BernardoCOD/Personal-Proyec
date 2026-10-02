import { Notification } from 'electron'
import type { Settings } from '@shared/types'

export interface NotifyInput {
  title: string
  body: string
  /** Vista que se abre al hacer clic (p. ej. "tareas"). */
  view?: string
  /** 1 (mínima) a 5 (urgente), como en ntfy. */
  priority?: 1 | 2 | 3 | 4 | 5
  tags?: string[]
  /** Si es false, solo se muestra en la computadora. */
  phone?: boolean
}

/**
 * Notificaciones de escritorio (Windows) y del celular.
 * Para el celular se usa ntfy (app gratuita para Android/iPhone): la app publica
 * en un "tema" secreto y tu celular, suscrito a ese tema, recibe el aviso.
 */
export class Notifier {
  constructor(
    private readonly getSettings: () => Settings,
    private readonly onClick: (view?: string) => void
  ) {}

  async send(n: NotifyInput): Promise<void> {
    const s = this.getSettings()
    if (s.desktopNotifications && Notification.isSupported()) {
      const notification = new Notification({ title: n.title, body: n.body })
      notification.on('click', () => this.onClick(n.view))
      notification.show()
    }
    if (s.phoneNotifications && n.phone !== false) {
      await this.sendPhone(s, n).catch((err: unknown) => console.error('No se pudo enviar al celular:', err))
    }
  }

  async sendPhone(s: Settings, n: NotifyInput): Promise<void> {
    if (!s.ntfyTopic) throw new Error('Falta el tema de ntfy en Ajustes → Notificaciones.')
    const server = s.ntfyServer.replace(/\/+$/, '') || 'https://ntfy.sh'
    // Se publica en JSON para que tildes y emojis lleguen bien.
    const res = await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: s.ntfyTopic, title: n.title, message: n.body, priority: n.priority ?? 3, tags: n.tags ?? [] })
    })
    if (!res.ok) throw new Error(`ntfy respondió ${res.status}`)
  }
}
