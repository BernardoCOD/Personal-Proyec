import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Account, MailAnalysis, MailMessage, Task } from '@shared/types'
import type { TaskInput } from '@shared/api'
import { groupTasks } from '@shared/tasks'
import { ruleAnalysis } from '@shared/classify'
import { addDays, toDateKey, WEEKDAYS_SHORT, weekdayMonFirst } from '@shared/dates'
import { activeHabitsOn, scoreDay } from '@shared/habits'
import { SERVICES } from '@shared/services'
import { api, useApp } from '../api'
import { AccountChip, fmtDateTime, fmtTime } from '../ui'
import { TaskEditor, TaskRow, taskFromMail } from './TaskParts'
import { MailRow } from './MailParts'
import { HabitChecklist } from './Habits'

const IMPORTANCE_ORDER = { alta: 0, media: 1, baja: 2 }

export function Dashboard() {
  const { snap, navigate, run } = useApp()
  const { data } = snap
  const [editing, setEditing] = useState<TaskInput | null | undefined>(undefined)
  const [quick, setQuick] = useState('')
  const now = new Date()
  const today = toDateKey(now)
  const groups = groupTasks(data.tasks, now)
  const todays = [...groups.overdue, ...groups.today]
  const upcoming = groups.upcoming.slice(0, 4)
  const emailsToSend = data.tasks.filter((t) => t.status !== 'hecha' && t.email)

  const mailTodo = useMemo(() => {
    const rows: { m: MailMessage; a: MailAnalysis; account: Account }[] = []
    for (const account of data.accounts) {
      const d = data.mail[account.id]
      if (!d) continue
      for (const m of d.messages) {
        const a = d.analysis[m.id] ?? ruleAnalysis(m)
        if (a.needsAction && m.unread) rows.push({ m, a, account })
      }
    }
    return rows.sort((x, y) => IMPORTANCE_ORDER[x.a.importance] - IMPORTANCE_ORDER[y.a.importance] || (x.m.date < y.m.date ? 1 : -1))
  }, [data.accounts, data.mail])

  const events = useMemo(() => {
    const all = data.accounts.flatMap((account) => (data.calendar[account.id]?.events ?? []).map((e) => ({ e, account })))
    return all.sort((a, b) => (a.e.start < b.e.start ? -1 : 1)).slice(0, 6)
  }, [data.accounts, data.calendar])

  const habitsToday = scoreDay(data.habits, data.habitLog, today, today)
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  const addQuick = async () => {
    if (!quick.trim()) return
    const ok = await run(api.saveTask({ title: quick, dueDate: today }))
    if (ok) setQuick('')
  }

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between wrap">
        <div>
          <h2 style={{ fontSize: 20 }}>{greeting} 👋</h2>
          <p className="muted">{new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {data.accounts.length === 0 && (
        <div className="alert info">
          <div>
            <strong>Empieza aquí:</strong> agrega tus cuentas de correo (Gmail y el correo de la universidad) en{' '}
            <a href="#" onClick={(e) => (e.preventDefault(), navigate('ajustes'))}>
              Ajustes → Cuentas
            </a>
            . Mientras tanto ya puedes usar tareas, hábitos, WhatsApp, Instagram y Facebook.
          </div>
        </div>
      )}

      <div className="stats">
        <Stat value={todays.length} label="Tareas para hoy" sub={groups.overdue.length ? `${groups.overdue.length} vencida(s)` : undefined} onClick={() => navigate('tareas')} />
        <Stat value={emailsToSend.length} label="Correos por enviar" onClick={() => navigate('tareas')} />
        <Stat value={mailTodo.length} label="Correos por atender" onClick={() => navigate('servicio:correo')} />
        <Stat value={`${habitsToday.done}/${habitsToday.total}`} label="Hábitos de hoy" onClick={() => navigate('habitos')} />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <h2>Pendientes de hoy</h2>
            <button className="btn small ghost" onClick={() => navigate('tareas')}>
              Ver todo
            </button>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <input type="text" placeholder="Agregar tarea para hoy y presionar Enter…" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addQuick()} />
          </div>
          <div className="list">
            {todays.length === 0 && <div className="empty">Nada pendiente para hoy 🎉</div>}
            {todays.map((t: Task) => (
              <TaskRow key={t.id} task={t} onEdit={setEditing} compact />
            ))}
          </div>
          {upcoming.length > 0 && (
            <>
              <div className="group-title">Próximos días</div>
              <div className="list">
                {upcoming.map((t) => (
                  <TaskRow key={t.id} task={t} onEdit={setEditing} compact />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Correos por atender</h2>
            <button className="btn small ghost" onClick={() => navigate('servicio:correo')}>
              Ver correo
            </button>
          </div>
          <div className="list">
            {data.accounts.every((a) => !a.connected) && <div className="empty">Conecta una cuenta en Ajustes para ver aquí tus correos importantes.</div>}
            {data.accounts.some((a) => a.connected) && mailTodo.length === 0 && <div className="empty">No hay correos sin leer que requieran acción.</div>}
            {mailTodo.slice(0, 8).map(({ m, a, account }) => (
              <MailRow key={account.id + m.id} m={m} a={a} account={account} showAccount onTask={() => setEditing(taskFromMail(m, a, account.id))} />
            ))}
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head">
              <h2>Hábitos de hoy</h2>
              <button className="btn small ghost" onClick={() => navigate('habitos')}>
                Ver mes
              </button>
            </div>
            {activeHabitsOn(data.habits, today).length === 0 ? (
              <div className="empty">
                Aún no tienes hábitos.{' '}
                <a href="#" onClick={(e) => (e.preventDefault(), navigate('habitos'))}>
                  Crear hábitos
                </a>
              </div>
            ) : (
              <>
                <HabitChecklist date={today} />
                <div className="week-strip" style={{ marginTop: 12 }}>
                  {week.map((d) => {
                    const s = scoreDay(data.habits, data.habitLog, d, today)
                    return (
                      <div key={d} className="d" title={`${d}: ${s.done}/${s.total}`}>
                        <span className={`cal-cell lvl-${s.level}`} style={{ aspectRatio: 'auto', height: 22, cursor: 'default' }} />
                        {WEEKDAYS_SHORT[weekdayMonFirst(d)]}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Próximos eventos</h2>
              <button className="btn small ghost" onClick={() => navigate('servicio:calendario')}>
                Calendario
              </button>
            </div>
            <div className="list">
              {events.length === 0 && <div className="empty">Sin eventos en los próximos 7 días.</div>}
              {events.map(({ e, account }) => (
                <div key={account.id + e.id} className="item">
                  <div className="body">
                    <div className="title">{e.title}</div>
                    <div className="meta">
                      <span>{e.allDay ? `${e.start} · todo el día` : `${fmtDateTime(e.start)} – ${fmtTime(e.end)}`}</span>
                      <AccountChip account={account} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Mis aplicaciones</h2>
        </div>
        <div className="apps-row">
          {SERVICES.map((s) => (
            <button key={s.id} className="app-tile" onClick={() => navigate(`servicio:${s.id}`)}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color }} />
              <strong>{s.name}</strong>
              <span className="small muted">{s.messaging ? 'Mensajes' : s.perAccount ? 'Por cuenta' : 'App web'}</span>
            </button>
          ))}
        </div>
      </section>

      {editing !== undefined && <TaskEditor initial={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function Stat({ value, label, sub, onClick }: { value: number | string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button className="card stat" onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer' }}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {sub && <div className="small danger-text">{sub}</div>}
    </button>
  )
}
