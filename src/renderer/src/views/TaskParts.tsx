import { useState } from 'react'
import { Bell, Check, Mail, Pencil, Send, Trash, ExternalLink } from 'lucide-react'
import type { Account, MailAnalysis, MailMessage, Priority, Task, TaskArea } from '@shared/types'
import type { TaskInput } from '@shared/api'
import { AREA_LABEL, PRIORITY_LABEL, composeUrl, isOverdue } from '@shared/tasks'
import { addDays, toDateKey } from '@shared/dates'
import { api, useApp } from '../api'
import { AccountChip, Modal, fmtDateKey, fmtDateTime } from '../ui'

export function activeAccount(accounts: Account[], activeId: string | null): Account | null {
  return accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null
}

/** Abre el redactor de correo (Gmail u Outlook) con los datos de la tarea. */
export function useCompose() {
  const { snap, openInService, toast } = useApp()
  return (task: Task) => {
    if (!task.email) return
    const acc = snap.data.accounts.find((a) => a.id === task.email?.accountId) ?? activeAccount(snap.data.accounts, snap.data.activeAccountId)
    if (!acc) {
      toast('Agrega una cuenta de correo en Ajustes para poder redactar.', 'error')
      return
    }
    openInService('correo', composeUrl(acc.provider, task.email), acc.id)
  }
}

export function TaskRow({ task, onEdit, compact = false }: { task: Task; onEdit: (t: Task) => void; compact?: boolean }) {
  const { snap, run } = useApp()
  const compose = useCompose()
  const done = task.status === 'hecha'
  const today = toDateKey(new Date())
  const account = task.email?.accountId ? snap.data.accounts.find((a) => a.id === task.email?.accountId) : undefined

  return (
    <div className={`item ${done ? 'done' : ''}`}>
      <button
        className={`check ${done ? 'on' : ''}`}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        onClick={() => void run(api.saveTask({ id: task.id, title: task.title, status: done ? 'pendiente' : 'hecha' }))}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="body">
        <div className="title">{task.title}</div>
        <div className="meta">
          {task.email && (
            <span className="chip">
              <Mail size={12} /> {task.email.to || 'sin destinatario'}
            </span>
          )}
          {account && <AccountChip account={account} />}
          {!compact && <span className="chip">{AREA_LABEL[task.area]}</span>}
          {task.priority === 'alta' && <span className="chip alta">Prioridad alta</span>}
          {task.dueDate && (
            <span className={isOverdue(task, today) ? 'danger-text' : ''}>
              {task.dueDate === today ? 'Hoy' : task.dueDate === addDays(today, 1) ? 'Mañana' : fmtDateKey(task.dueDate)}
              {isOverdue(task, today) && ' · vencida'}
            </span>
          )}
          {task.remindAt && !done && (
            <span className="row" style={{ gap: 3 }}>
              <Bell size={12} /> {fmtDateTime(task.remindAt)}
            </span>
          )}
        </div>
      </div>
      <div className="actions">
        {task.email && !done && (
          <button className="btn small primary" onClick={() => compose(task)} title="Redactar este correo">
            <Send size={13} /> Redactar
          </button>
        )}
        {task.source && (
          <button className="icon-btn" title="Ver el correo original" onClick={() => void run(api.openExternal(task.source?.link ?? ''))}>
            <ExternalLink size={15} />
          </button>
        )}
        <button className="icon-btn" title="Editar" onClick={() => onEdit(task)}>
          <Pencil size={15} />
        </button>
        {!compact && (
          <button
            className="icon-btn"
            title="Eliminar"
            onClick={() => {
              if (confirm(`¿Eliminar la tarea "${task.title}"?`)) void run(api.deleteTask(task.id), 'Tarea eliminada')
            }}
          >
            <Trash size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Datos iniciales para una tarea creada desde un correo. */
export function taskFromMail(m: MailMessage, a: MailAnalysis, accountId: string): TaskInput {
  const area: TaskArea = a.category === 'educativo' ? 'estudio' : a.category === 'laboral' ? 'trabajo' : a.category === 'estatal' ? 'tramite' : 'personal'
  const isReply = /respond|contest|confirm|envi|escrib|reply/i.test(a.action)
  return {
    title: a.action || `Responder: ${m.subject}`,
    notes: `Correo de ${m.from}: "${m.subject}"\n${a.summary}`,
    area,
    priority: a.importance,
    dueDate: a.deadline,
    source: { accountId, messageId: m.id, link: m.link },
    email: isReply ? { accountId, to: m.fromEmail, subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`, body: '' } : null
  }
}

export function TaskEditor({ initial, onClose }: { initial: TaskInput | null; onClose: () => void }) {
  const { snap, run } = useApp()
  const accounts = snap.data.accounts
  const [t, setT] = useState<TaskInput>(
    initial ?? { title: '', area: 'personal', priority: 'media', dueDate: null, remindAt: null, email: null, notes: '' }
  )
  const [saving, setSaving] = useState(false)
  const set = (changes: Partial<TaskInput>) => setT((x) => ({ ...x, ...changes }))
  const isEmail = Boolean(t.email)
  const defaultAccount = activeAccount(accounts, snap.data.activeAccountId)

  const remindPreset = (kind: 'hora' | 'tarde' | 'manana') => {
    const d = new Date()
    if (kind === 'hora') d.setHours(d.getHours() + 1)
    if (kind === 'tarde') {
      d.setHours(18, 0, 0, 0)
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
    }
    if (kind === 'manana') {
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
    }
    set({ remindAt: d.toISOString() })
  }

  const save = async () => {
    setSaving(true)
    const ok = await run(api.saveTask(t), t.id ? 'Tarea actualizada' : 'Tarea creada')
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title={t.id ? 'Editar tarea' : 'Nueva tarea'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={saving || !t.title.trim()}>
            Guardar
          </button>
        </>
      }
    >
      <div className="tabs" style={{ width: 'fit-content' }}>
        <button className={!isEmail ? 'active' : ''} onClick={() => set({ email: null })}>
          Tarea
        </button>
        <button
          className={isEmail ? 'active' : ''}
          onClick={() => set({ email: t.email ?? { accountId: defaultAccount?.id ?? null, to: '', subject: '', body: '' } })}
        >
          ✉️ Correo por enviar
        </button>
      </div>

      <label className="field">
        {isEmail ? '¿Qué correo tienes que enviar?' : 'Tarea'}
        <input
          type="text"
          autoFocus
          value={t.title}
          placeholder={isEmail ? 'Ej.: Enviar el informe al profesor' : 'Ej.: Estudiar para el examen de cálculo'}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && t.title.trim() && void save()}
        />
      </label>

      {t.email && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="grid-2">
            <label className="field">
              Enviar desde
              <select value={t.email.accountId ?? ''} onChange={(e) => set({ email: { ...t.email!, accountId: e.target.value || null } })}>
                <option value="">Cuenta activa en ese momento</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} {a.email ? `(${a.email})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Para
              <input type="email" value={t.email.to} placeholder="correo@ejemplo.com" onChange={(e) => set({ email: { ...t.email!, to: e.target.value } })} />
            </label>
          </div>
          <label className="field">
            Asunto
            <input type="text" value={t.email.subject} onChange={(e) => set({ email: { ...t.email!, subject: e.target.value } })} />
          </label>
          <label className="field">
            Borrador del mensaje (opcional)
            <textarea value={t.email.body} onChange={(e) => set({ email: { ...t.email!, body: e.target.value } })} />
          </label>
        </div>
      )}

      <div className="grid-2">
        <label className="field">
          Área
          <select value={t.area} onChange={(e) => set({ area: e.target.value as TaskArea })}>
            {Object.entries(AREA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Prioridad
          <select value={t.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          Fecha límite
          <input type="date" value={t.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
        </label>
        <label className="field">
          Recordarme (computadora y celular)
          <input type="datetime-local" value={isoToLocalInput(t.remindAt ?? null)} onChange={(e) => set({ remindAt: localInputToIso(e.target.value) })} />
        </label>
      </div>
      <div className="row wrap">
        <span className="small muted">Recordar:</span>
        <button className="btn small" onClick={() => remindPreset('hora')}>
          En 1 hora
        </button>
        <button className="btn small" onClick={() => remindPreset('tarde')}>
          A las 18:00
        </button>
        <button className="btn small" onClick={() => remindPreset('manana')}>
          Mañana 9:00
        </button>
        {t.remindAt && (
          <button className="btn small ghost" onClick={() => set({ remindAt: null })}>
            Quitar recordatorio
          </button>
        )}
      </div>

      <label className="field">
        Notas
        <textarea value={t.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </Modal>
  )
}
