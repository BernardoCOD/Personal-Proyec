import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Archive, Check, ChevronLeft, ChevronRight, Pencil, Plus, Sparkles } from 'lucide-react'
import type { QuestionAnswer, Reflection } from '@shared/types'
import { activeHabitsOn, LEVEL_LABEL, monthStats, scoreDay, type DayLevel, type MonthStats } from '@shared/habits'
import { buildQuestions, type Question } from '@shared/questionnaire'
import { MONTHS, WEEKDAYS_SHORT, monthDays, toDateKey, weekdayMonFirst } from '@shared/dates'
import { api, useApp } from '../api'
import { Modal, Spinner, fmtDateKey, pct } from '../ui'

type Tab = 'hoy' | 'mes' | 'cuestionario'

export function Habits() {
  const [tab, setTab] = useState<Tab>('hoy')
  const today = toDateKey(new Date())
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))

  return (
    <div className="stack" style={{ maxWidth: 1000, gap: 16 }}>
      <div className="tabs" style={{ width: 'fit-content' }}>
        <button className={tab === 'hoy' ? 'active' : ''} onClick={() => setTab('hoy')}>
          Hoy
        </button>
        <button className={tab === 'mes' ? 'active' : ''} onClick={() => setTab('mes')}>
          Calendario y resumen del mes
        </button>
        <button className={tab === 'cuestionario' ? 'active' : ''} onClick={() => setTab('cuestionario')}>
          Cuestionario
        </button>
      </div>
      {tab === 'hoy' && <TodayTab />}
      {tab === 'mes' && <MonthTab ym={ym} setYm={setYm} goQuestionnaire={() => setTab('cuestionario')} />}
      {tab === 'cuestionario' && <QuestionnaireTab ym={ym} setYm={setYm} />}
    </div>
  )
}

const LEVEL_COLOR: Record<DayLevel, string> = {
  perfecto: 'var(--lvl-perfecto)',
  alto: 'var(--lvl-alto)',
  medio: 'var(--lvl-medio)',
  bajo: 'var(--lvl-bajo)',
  nulo: 'var(--lvl-nulo)',
  sin_habitos: 'var(--lvl-vacio)',
  futuro: 'var(--lvl-vacio)'
}

/** Lista de casillas de los hábitos de un día. */
export function HabitChecklist({ date }: { date: string }) {
  const { snap, run } = useApp()
  const habits = activeHabitsOn(snap.data.habits, date)
  const done = new Set(snap.data.habitLog[date] ?? [])
  return (
    <div className="habit-today">
      {habits.map((h) => {
        const on = done.has(h.id)
        return (
          <button key={h.id} className={`habit-row ${on ? 'on' : ''}`} onClick={() => void run(api.toggleHabit(date, h.id))}>
            <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            <span className="emoji">{h.emoji}</span>
            <span className="name">{h.name}</span>
            {on && <span className="small ok-text">Cumplido</span>}
          </button>
        )
      })}
    </div>
  )
}

function DayProgress({ date }: { date: string }) {
  const { snap } = useApp()
  const today = toDateKey(new Date())
  const s = scoreDay(snap.data.habits, snap.data.habitLog, date, today)
  if (s.total === 0) return null
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between">
        <strong>
          {s.done} de {s.total} cumplidos
        </strong>
        <span className="small text-2">{s.level === 'perfecto' ? '¡Día completo! 🟩' : LEVEL_LABEL[s.level]}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={s.done} aria-valuemax={s.total}>
        <div style={{ width: `${(s.done / s.total) * 100}%`, background: LEVEL_COLOR[s.level] }} />
      </div>
    </div>
  )
}

const EMOJIS = ['✅', '📚', '🏃', '💧', '🧘', '🛏️', '🥗', '✍️', '💻', '🎯', '📵', '🙏']

function TodayTab() {
  const { snap, run } = useApp()
  const today = toDateKey(new Date())
  const habits = activeHabitsOn(snap.data.habits, today)
  const [editing, setEditing] = useState<{ id?: string; name: string; emoji: string } | null>(null)

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Hoy · {new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</h2>
        </div>
        {habits.length === 0 ? (
          <div className="empty">Crea tus hábitos (por ejemplo 4) para empezar a marcarlos cada día.</div>
        ) : (
          <>
            <DayProgress date={today} />
            <HabitChecklist date={today} />
          </>
        )}
      </section>

      <section className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Mis hábitos</h2>
          <button className="btn small primary" onClick={() => setEditing({ name: '', emoji: '✅' })}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        <div className="list">
          {habits.map((h, i) => (
            <div key={h.id} className="item" style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 20 }}>{h.emoji}</span>
              <div className="body">
                <div className="title">{h.name}</div>
                <div className="meta">Desde {fmtDateKey(h.startDate)}</div>
              </div>
              <div className="actions">
                <button className="icon-btn" title="Subir" disabled={i === 0} onClick={() => void run(api.moveHabit(h.id, -1))}>
                  <ArrowUp size={15} />
                </button>
                <button className="icon-btn" title="Bajar" disabled={i === habits.length - 1} onClick={() => void run(api.moveHabit(h.id, 1))}>
                  <ArrowDown size={15} />
                </button>
                <button className="icon-btn" title="Editar" onClick={() => setEditing({ id: h.id, name: h.name, emoji: h.emoji })}>
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn"
                  title="Dejar de seguir (se conserva el historial)"
                  onClick={() => {
                    if (confirm(`¿Dejar de seguir "${h.name}"? Su historial se conserva en los meses anteriores.`)) void run(api.archiveHabit(h.id), 'Hábito archivado')
                  }}
                >
                  <Archive size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="small muted">
          El color de cada día depende de cuántos hábitos cumples: verde si cumples todos, y luego lima, amarillo, naranja y rojo según cuántos falten.
        </p>
      </section>

      {editing && (
        <Modal
          title={editing.id ? 'Editar hábito' : 'Nuevo hábito'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button
                className="btn primary"
                disabled={!editing.name.trim()}
                onClick={() => void run(api.saveHabit(editing), 'Hábito guardado').then((ok) => ok && setEditing(null))}
              >
                Guardar
              </button>
            </>
          }
        >
          <label className="field">
            Nombre
            <input type="text" autoFocus value={editing.name} placeholder="Ej.: Leer 20 minutos" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <div className="field">
            Ícono
            <div className="option-grid">
              {EMOJIS.map((e) => (
                <button key={e} className={editing.emoji === e ? 'on' : ''} onClick={() => setEditing({ ...editing, emoji: e })}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MonthNav({ ym, setYm }: { ym: { y: number; m: number }; setYm: (v: { y: number; m: number }) => void }) {
  const today = toDateKey(new Date())
  const isCurrent = ym.y === Number(today.slice(0, 4)) && ym.m === Number(today.slice(5, 7))
  const shift = (d: number) => {
    const m0 = ym.m - 1 + d
    setYm({ y: ym.y + Math.floor(m0 / 12), m: ((m0 % 12) + 12) % 12 + 1 })
  }
  return (
    <div className="row">
      <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
        <ChevronLeft size={18} />
      </button>
      <strong style={{ minWidth: 140, textAlign: 'center' }}>
        {MONTHS[ym.m - 1]} {ym.y}
      </strong>
      <button className="icon-btn" onClick={() => shift(1)} disabled={isCurrent} aria-label="Mes siguiente">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

function useMonthStats(ym: { y: number; m: number }): MonthStats {
  const { snap } = useApp()
  const today = toDateKey(new Date())
  return useMemo(() => monthStats(snap.data.habits, snap.data.habitLog, ym.y, ym.m, today), [snap.data.habits, snap.data.habitLog, ym.y, ym.m, today])
}

function MonthTab({ ym, setYm, goQuestionnaire }: { ym: { y: number; m: number }; setYm: (v: { y: number; m: number }) => void; goQuestionnaire: () => void }) {
  const today = toDateKey(new Date())
  const stats = useMonthStats(ym)
  const days = monthDays(ym.y, ym.m)
  const [selected, setSelected] = useState<string | null>(null)
  const offset = weekdayMonFirst(days[0])
  const selectedScore = selected ? stats.days.find((d) => d.date === selected) : undefined

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card stack">
          <div className="row between">
            <h2>Calendario</h2>
            <MonthNav ym={ym} setYm={(v) => (setYm(v), setSelected(null))} />
          </div>
          <div className="cal">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="wd">
                {w}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`e${i}`} />
            ))}
            {stats.days.map((d) => {
              const clickable = d.level !== 'futuro' && d.level !== 'sin_habitos'
              return (
                <button
                  key={d.date}
                  className={`cal-cell lvl-${d.level} ${d.date === today ? 'today' : ''} ${d.date === selected ? 'selected' : ''}`}
                  title={`${fmtDateKey(d.date)}: ${d.done}/${d.total} · ${LEVEL_LABEL[d.level]}`}
                  onClick={() => clickable && setSelected(d.date === selected ? null : d.date)}
                  disabled={!clickable}
                >
                  <span className="n">{Number(d.date.slice(8))}</span>
                  {d.total > 0 && d.level !== 'futuro' && (
                    <span className="f">
                      {d.done}/{d.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="legend">
            {(['perfecto', 'alto', 'medio', 'bajo', 'nulo'] as DayLevel[]).map((l) => (
              <span key={l}>
                <span className="sw" style={{ background: LEVEL_COLOR[l] }} />
                {LEVEL_LABEL[l]}
              </span>
            ))}
          </div>
          <p className="small muted">Toca un día pasado para corregir o completar sus casillas.</p>
        </section>

        <section className="card stack">
          {selected && selectedScore ? (
            <>
              <div className="row between">
                <h2>{new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selected}T12:00`))}</h2>
                <button className="btn small ghost" onClick={() => setSelected(null)}>
                  Cerrar
                </button>
              </div>
              <DayProgress date={selected} />
              <HabitChecklist date={selected} />
            </>
          ) : (
            <MonthHighlights stats={stats} goQuestionnaire={goQuestionnaire} />
          )}
        </section>
      </div>

      {stats.countedDays > 0 && <MonthCharts stats={stats} />}
    </div>
  )
}

function MonthHighlights({ stats, goQuestionnaire }: { stats: MonthStats; goQuestionnaire: () => void }) {
  if (stats.countedDays === 0) {
    return <div className="empty">Todavía no hay días registrados en este mes.</div>
  }
  return (
    <>
      <h2>Resumen del mes</h2>
      <div className="insights">
        <div className="insight">
          <span className="k">Cumplimiento total</span>
          <span className="v">{pct(stats.overallRate)}</span>
        </div>
        <div className="insight">
          <span className="k">Días perfectos 🟩</span>
          <span className="v">
            {stats.perfectDays} de {stats.countedDays}
          </span>
        </div>
        <div className="insight">
          <span className="k">Días sin ningún hábito</span>
          <span className="v">{stats.zeroDays}</span>
        </div>
        <div className="insight">
          <span className="k">Mejor racha perfecta</span>
          <span className="v">{stats.longestPerfectStreak} día(s)</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {stats.strongestHabit && (
          <p>
            💪 <strong>Punto fuerte:</strong> {stats.strongestHabit.emoji} {stats.strongestHabit.name} ({pct(stats.strongestHabit.rate)})
          </p>
        )}
        {stats.weakestHabit && stats.weakestHabit.habitId !== stats.strongestHabit?.habitId && (
          <p>
            ⚠️ <strong>Por mejorar:</strong> {stats.weakestHabit.emoji} {stats.weakestHabit.name} ({pct(stats.weakestHabit.rate)})
          </p>
        )}
        {stats.bestWeekday && (
          <p>
            📈 <strong>Mejor día:</strong> {stats.bestWeekday.name} ({pct(stats.bestWeekday.rate)})
          </p>
        )}
        {stats.worstWeekday && stats.worstWeekday.weekday !== stats.bestWeekday?.weekday && (
          <p>
            📉 <strong>Día más difícil:</strong> {stats.worstWeekday.name} ({pct(stats.worstWeekday.rate)})
          </p>
        )}
      </div>
      <button className="btn primary" style={{ width: 'fit-content' }} onClick={goQuestionnaire}>
        <Sparkles size={15} /> Hacer el cuestionario: ¿qué me está fallando?
      </button>
    </>
  )
}

function Bars({ rows }: { rows: { key: string; label: string; rate: number; detail: string }[] }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.key} className="bar-row" title={`${r.label}: ${pct(r.rate)} (${r.detail})`}>
          <span className="label">{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${Math.max(r.rate * 100, 0.5)}%` }} />
          </div>
          <span className="v">{pct(r.rate)}</span>
        </div>
      ))}
    </div>
  )
}

function MonthCharts({ stats }: { stats: MonthStats }) {
  return (
    <div className="dash-grid">
      <section className="card">
        <div className="card-head">
          <h3>Cumplimiento por hábito</h3>
        </div>
        <Bars rows={stats.perHabit.map((h) => ({ key: h.habitId, label: `${h.emoji} ${h.name}`, rate: h.rate, detail: `${h.done} de ${h.possible} días · racha ${h.longestStreak}` }))} />
      </section>
      <section className="card">
        <div className="card-head">
          <h3>Por día de la semana</h3>
        </div>
        <Bars rows={stats.perWeekday.filter((w) => w.possible > 0).map((w) => ({ key: w.name, label: w.name, rate: w.rate, detail: `${w.done} de ${w.possible}` }))} />
      </section>
      <section className="card">
        <div className="card-head">
          <h3>Por semana del mes</h3>
        </div>
        <Bars rows={stats.perWeek.map((w) => ({ key: String(w.week), label: `Semana ${w.week}`, rate: w.rate, detail: `${w.possible} marcas posibles` }))} />
      </section>
    </div>
  )
}

function QuestionnaireTab({ ym, setYm }: { ym: { y: number; m: number }; setYm: (v: { y: number; m: number }) => void }) {
  const { snap, run } = useApp()
  const stats = useMonthStats(ym)
  const questions = useMemo(() => buildQuestions(stats), [stats])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Reflection | null>(null)
  const busy = snap.busy.includes('reflexion')
  const month = `${ym.y}-${String(ym.m).padStart(2, '0')}`
  const history = snap.data.reflections.filter((r) => r.month === month)

  const submit = async () => {
    const list: QuestionAnswer[] = questions.map((q) => ({ questionId: q.id, question: q.text, answer: answers[q.id] ?? '' }))
    const r = await run(api.saveReflection(month, list))
    if (r) {
      setResult(r)
      setAnswers({})
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between wrap">
        <p className="text-2" style={{ maxWidth: 620 }}>
          Responde con sinceridad: el análisis cruza tus respuestas con tu calendario para encontrar qué te impide ser constante.
        </p>
        <MonthNav ym={ym} setYm={(v) => (setYm(v), setResult(null))} />
      </div>

      {result?.analysis && <AnalysisCard reflection={result} />}

      {stats.countedDays === 0 ? (
        <section className="card empty">No hay días registrados en este mes todavía.</section>
      ) : (
        <section className="card">
          <h2>Cuestionario de {MONTHS[ym.m - 1].toLowerCase()}</h2>
          {questions.map((q) => (
            <QuestionField key={q.id} q={q} value={answers[q.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner /> : <Sparkles size={15} />} Analizar mi mes
            </button>
            {busy && <span className="small muted">Analizando… puede tardar unos segundos.</span>}
          </div>
        </section>
      )}

      {history.filter((r) => r.id !== result?.id).length > 0 && (
        <section className="card stack">
          <h2>Análisis anteriores de este mes</h2>
          {history
            .filter((r) => r.id !== result?.id)
            .map((r) => (
              <details key={r.id}>
                <summary>
                  {new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(r.createdAt))} —{' '}
                  {r.analysis?.resumen.slice(0, 90)}…
                </summary>
                <AnalysisCard reflection={r} />
              </details>
            ))}
        </section>
      )}
    </div>
  )
}

function QuestionField({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const selected = value ? value.split(';').map((s) => s.trim()) : []
  return (
    <div className="question">
      <strong>{q.text}</strong>
      {q.hint && <span className="small muted">{q.hint}</span>}
      {q.kind === 'escala' && (
        <div className="scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={value === String(n) ? 'on' : ''} onClick={() => onChange(String(n))}>
              {n}
            </button>
          ))}
        </div>
      )}
      {q.kind === 'opciones' && (
        <div className="option-grid">
          {q.options?.map((o) => {
            const on = selected.includes(o)
            return (
              <button key={o} className={on ? 'on' : ''} onClick={() => onChange((on ? selected.filter((s) => s !== o) : [...selected, o]).join('; '))}>
                {o}
              </button>
            )
          })}
        </div>
      )}
      {q.kind === 'texto' && <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Escribe aquí…" />}
    </div>
  )
}

function AnalysisCard({ reflection }: { reflection: Reflection }) {
  const a = reflection.analysis
  if (!a) return null
  return (
    <section className="card analysis">
      <div className="row between">
        <h2>¿Qué está pasando con mis hábitos?</h2>
        <span className={`chip ${a.source === 'ia' ? 'ia' : ''}`}>{a.source === 'ia' ? 'Análisis con IA' : 'Análisis automático'}</span>
      </div>
      <p style={{ marginTop: 8 }}>{a.resumen}</p>
      {a.fortalezas.length > 0 && (
        <>
          <h3>💪 Lo que te funciona</h3>
          <ul>{a.fortalezas.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </>
      )}
      {a.obstaculos.length > 0 && (
        <>
          <h3>🧱 Lo que interfiere</h3>
          <ul>
            {a.obstaculos.map((o, i) => (
              <li key={i}>
                <strong>{o.factor}:</strong> {o.evidencia}
              </li>
            ))}
          </ul>
        </>
      )}
      {a.patrones.length > 0 && (
        <>
          <h3>🔍 Patrones</h3>
          <ul>{a.patrones.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </>
      )}
      {a.recomendaciones.length > 0 && (
        <>
          <h3>🎯 Para el próximo mes</h3>
          <ul>
            {a.recomendaciones.map((r, i) => (
              <li key={i}>
                <strong>{r.accion}</strong> — {r.porque}
              </li>
            ))}
          </ul>
        </>
      )}
      {a.mensaje && <p style={{ marginTop: 12, fontStyle: 'italic' }}>{a.mensaje}</p>}
    </section>
  )
}
