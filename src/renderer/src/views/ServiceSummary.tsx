import { useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import type { Account } from '@shared/types'
import type { TaskInput } from '@shared/api'
import { partitionFor, type ServiceDef } from '@shared/services'
import { CATEGORY_LABEL, ruleAnalysis, splitByAction } from '@shared/classify'
import { toDateKey } from '@shared/dates'
import { api, useApp } from '../api'
import { Alert, Spinner, fmtDateTime, fmtTime, relTime } from '../ui'
import { MailRow } from './MailParts'
import { TaskEditor, taskFromMail } from './TaskParts'

export function ServiceSummary({ service, account, openApp }: { service: ServiceDef; account: Account | null; openApp: () => void }) {
  if (service.perAccount && !account) return <NoAccount />
  if (service.id === 'correo' && account) return <MailSummary account={account} openApp={openApp} />
  if (service.id === 'calendario' && account) return <CalendarSummary account={account} openApp={openApp} />
  if (service.id === 'notion') return <NotionSummary openApp={openApp} />
  return <MessagingSummary service={service} openApp={openApp} />
}

function NoAccount() {
  const { navigate } = useApp()
  return (
    <section className="card empty">
      <p>Agrega primero una cuenta de Google o Microsoft.</p>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={() => navigate('ajustes')}>
        Ir a Ajustes → Cuentas
      </button>
    </section>
  )
}

function NotConnected({ account, openApp }: { account: Account; openApp: () => void }) {
  const { navigate } = useApp()
  return (
    <section className="card stack">
      <Alert kind="info">
        La cuenta <strong>{account.label}</strong> está en modo <strong>solo web</strong>: puedes usarla dentro de la app, pero para ver resúmenes hay que
        conectarla (Ajustes → Cuentas → Conectar).
      </Alert>
      <div className="row">
        <button className="btn primary" onClick={openApp}>
          Abrir {account.provider === 'google' ? 'Gmail' : 'Outlook'}
        </button>
        <button className="btn" onClick={() => navigate('ajustes')}>
          Conectar la cuenta
        </button>
      </div>
    </section>
  )
}

function MailSummary({ account, openApp }: { account: Account; openApp: () => void }) {
  const { snap, run } = useApp()
  const [editing, setEditing] = useState<TaskInput | undefined>(undefined)
  const [showAll, setShowAll] = useState(false)
  if (!account.connected) return <NotConnected account={account} openApp={openApp} />

  const digest = snap.data.mail[account.id]
  const busy = snap.busy.includes(`cuenta:${account.id}`)
  if (!digest) {
    return (
      <section className="card empty">
        {busy ? (
          <>
            <Spinner /> Leyendo tus correos…
          </>
        ) : (
          <button className="btn primary" onClick={() => void run(api.refreshAccount(account.id))}>
            Cargar correos
          </button>
        )}
      </section>
    )
  }

  const { todo, rest } = splitByAction(digest.messages, digest.analysis)
  const byCategory = Object.entries(
    digest.messages.reduce<Record<string, number>>((acc, m) => {
      const c = (digest.analysis[m.id] ?? ruleAnalysis(m)).category
      acc[c] = (acc[c] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const restShown = showAll ? rest : rest.slice(0, 12)

  return (
    <div className="stack" style={{ gap: 16 }}>
      {digest.error && <Alert kind="error">{digest.error}</Alert>}
      {digest.aiError && <Alert>La IA no pudo clasificar los correos nuevos ({digest.aiError}). Se usó la clasificación automática.</Alert>}

      <section className="card">
        <div className="row between wrap">
          <div className="stack" style={{ gap: 4 }}>
            <h2>
              {digest.unreadCount} sin leer · {todo.length} por hacer
            </h2>
            <span className="small muted">
              Últimos 7 días · actualizado {relTime(digest.fetchedAt)} · {byCategory.map(([c, n]) => `${CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]}: ${n}`).join(' · ')}
            </span>
          </div>
          <div className="row">
            <button className="btn" onClick={() => void run(api.refreshAccount(account.id))} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCw size={15} />} Actualizar
            </button>
            <button className="btn primary" onClick={openApp}>
              Abrir {account.provider === 'google' ? 'Gmail' : 'Outlook'}
            </button>
          </div>
        </div>
      </section>

      <div className="mail-cols">
        <section className="card">
          <div className="card-head">
            <h2>📌 Por hacer</h2>
            <span className="chip alta">{todo.length}</span>
          </div>
          <div className="list">
            {todo.length === 0 && <div className="empty">Nada que requiera acción. 🎉</div>}
            {todo.map(({ m, a }) => (
              <MailRow key={m.id} m={m} a={a} account={account} onTask={() => setEditing(taskFromMail(m, a, account.id))} />
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>📭 Sin acción (solo informativos)</h2>
            <span className="chip">{rest.length}</span>
          </div>
          <div className="list">
            {rest.length === 0 && <div className="empty">No hay correos informativos.</div>}
            {restShown.map(({ m, a }) => (
              <MailRow key={m.id} m={m} a={a} account={account} onTask={() => setEditing(taskFromMail(m, a, account.id))} />
            ))}
          </div>
          {rest.length > restShown.length && (
            <button className="btn small ghost" onClick={() => setShowAll(true)}>
              Ver {rest.length - restShown.length} más
            </button>
          )}
        </section>
      </div>
      {editing && <TaskEditor initial={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function CalendarSummary({ account, openApp }: { account: Account; openApp: () => void }) {
  const { snap } = useApp()
  if (!account.connected) return <NotConnected account={account} openApp={openApp} />
  const cal = snap.data.calendar[account.id]
  const today = toDateKey(new Date())
  const byDay = new Map<string, NonNullable<typeof cal>['events']>()
  for (const e of cal?.events ?? []) {
    const day = e.allDay ? e.start.slice(0, 10) : toDateKey(new Date(e.start))
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      {cal?.error && <Alert kind="error">{cal.error}</Alert>}
      <section className="card">
        <div className="card-head">
          <h2>Próximos 7 días</h2>
          <button className="btn primary" onClick={openApp}>
            Abrir calendario
          </button>
        </div>
        {byDay.size === 0 && <div className="empty">Sin eventos en los próximos 7 días.</div>}
        {[...byDay.entries()].map(([day, events]) => (
          <div key={day}>
            <div className="group-title">{day === today ? 'Hoy' : new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00`))}</div>
            <div className="list">
              {events.map((e) => (
                <div key={e.id} className="item">
                  <div className="body">
                    <div className="title">{e.title}</div>
                    <div className="meta">
                      <span>{e.allDay ? 'Todo el día' : `${fmtTime(e.start)} – ${fmtTime(e.end)}`}</span>
                      {e.location && <span>📍 {e.location}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function NotionSummary({ openApp }: { openApp: () => void }) {
  const { snap, run, navigate } = useApp()
  const s = snap.data.settings
  const linked = snap.data.tasks.filter((t) => t.notion).length
  return (
    <section className="card stack" style={{ maxWidth: 720 }}>
      <h2>Tus tareas en Notion</h2>
      {s.notionEnabled && s.notionDatabaseId ? (
        <>
          <p>
            {linked} tarea(s) sincronizadas con la base de datos <strong>Tareas · Centro de Mando</strong>. Los cambios que hagas en el celular aparecen aquí en
            unos minutos, y viceversa.
          </p>
          {snap.data.notionLastSync && <p className="small muted">Última sincronización: {fmtDateTime(snap.data.notionLastSync)}</p>}
          {snap.data.notionLastError && <Alert kind="error">{snap.data.notionLastError}</Alert>}
          <div className="row">
            <button className="btn" onClick={() => void run(api.notionSyncNow(), 'Notion sincronizado')} disabled={snap.busy.includes('notion')}>
              {snap.busy.includes('notion') ? <Spinner /> : <RefreshCw size={15} />} Sincronizar ahora
            </button>
            <button className="btn primary" onClick={openApp}>
              Abrir Notion
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Conecta Notion para ver y marcar tus tareas desde la app de Notion en el celular.</p>
          <div className="row">
            <button className="btn primary" onClick={() => navigate('ajustes')}>
              Configurar Notion
            </button>
            <button className="btn" onClick={openApp}>
              Abrir Notion
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function MessagingSummary({ service, openApp }: { service: ServiceDef; openApp: () => void }) {
  const { snap, run } = useApp()
  const count = snap.badges[`${service.id}|${partitionFor(service, null)}`]
  return (
    <section className="card stack" style={{ maxWidth: 720 }}>
      <div className="row" style={{ gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 14, background: service.color, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 22, fontWeight: 700 }}>
          {count ?? '–'}
        </span>
        <div>
          <h2>{count === undefined ? 'Aún no cargado' : count === 0 ? 'Nada pendiente' : `${count} sin leer`}</h2>
          <p className="small muted">{service.messaging ? 'Se actualiza solo mientras la app está abierta en segundo plano.' : ''}</p>
        </div>
      </div>
      {service.summaryNote && <p className="text-2">{service.summaryNote}</p>}
      <div className="row">
        <button className="btn primary" onClick={openApp}>
          Abrir {service.name}
        </button>
        <button className="btn" onClick={() => void run(api.openExternal(service.url(null)))}>
          <ExternalLink size={15} /> En el navegador
        </button>
      </div>
      {count === undefined && !snap.data.settings.backgroundMessaging && (
        <p className="small muted">Activa “Mantener mensajería en segundo plano” en Ajustes → General para ver el número sin abrirla.</p>
      )}
    </section>
  )
}
