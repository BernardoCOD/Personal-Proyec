import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Task, TaskArea } from '@shared/types'
import type { TaskInput } from '@shared/api'
import { AREA_LABEL, groupTasks } from '@shared/tasks'
import { useApp } from '../api'
import { TaskEditor, TaskRow } from './TaskParts'

type Filter = 'todas' | 'correos' | TaskArea

export function Tasks() {
  const { snap } = useApp()
  const [editing, setEditing] = useState<TaskInput | null | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('todas')
  const [query, setQuery] = useState('')
  const [showDone, setShowDone] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = snap.data.tasks.filter((t) => {
    if (filter === 'correos' && !t.email) return false
    if (filter !== 'todas' && filter !== 'correos' && t.area !== filter) return false
    if (q && !`${t.title} ${t.notes} ${t.email?.to ?? ''} ${t.email?.subject ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const g = groupTasks(filtered, new Date())
  const pendingEmails = snap.data.tasks.filter((t) => t.email && t.status !== 'hecha').length

  const section = (title: string, tasks: Task[], tone?: string) =>
    tasks.length > 0 && (
      <>
        <div className="group-title">
          <span className={tone}>{title}</span>
          <span className="chip">{tasks.length}</span>
        </div>
        <div className="list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onEdit={setEditing} />
          ))}
        </div>
      </>
    )

  const openCount = g.overdue.length + g.today.length + g.upcoming.length + g.noDate.length

  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <div className="row wrap between">
        <div className="tabs">
          <button className={filter === 'todas' ? 'active' : ''} onClick={() => setFilter('todas')}>
            Todas
          </button>
          <button className={filter === 'correos' ? 'active' : ''} onClick={() => setFilter('correos')}>
            ✉️ Correos por enviar {pendingEmails > 0 && `(${pendingEmails})`}
          </button>
          {(Object.keys(AREA_LABEL) as TaskArea[]).map((a) => (
            <button key={a} className={filter === a ? 'active' : ''} onClick={() => setFilter(a)}>
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
        <div className="row">
          <div className="row" style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--muted)' }} />
            <input type="text" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 32, width: 200 }} />
          </div>
          <button className="btn primary" onClick={() => setEditing(filter === 'correos' ? { title: '', email: { accountId: null, to: '', subject: '', body: '' } } : null)}>
            <Plus size={16} /> {filter === 'correos' ? 'Nuevo correo por enviar' : 'Nueva tarea'}
          </button>
        </div>
      </div>

      <section className="card">
        {openCount === 0 && <div className="empty">{q ? 'Ninguna tarea coincide con la búsqueda.' : 'No tienes tareas pendientes aquí. ¡Bien hecho!'}</div>}
        {section('Vencidas', g.overdue, 'danger-text')}
        {section('Hoy', g.today)}
        {section('Próximas', g.upcoming)}
        {section('Sin fecha', g.noDate)}
        {g.done.length > 0 && (
          <>
            <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setShowDone((x) => !x)}>
              {showDone ? 'Ocultar' : 'Mostrar'} hechas ({g.done.length})
            </button>
            {showDone && section('Hechas', g.done.slice().sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1)))}
          </>
        )}
      </section>

      <p className="small muted">
        Consejo: en los correos por enviar, el botón <strong>Redactar</strong> abre tu Gmail u Outlook con el destinatario y el asunto listos. Cuando lo envíes,
        marca la casilla para tacharlo.
      </p>

      {editing !== undefined && <TaskEditor initial={editing} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
