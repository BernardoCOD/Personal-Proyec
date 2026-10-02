import { ExternalLink, ListPlus } from 'lucide-react'
import type { Account, MailAnalysis, MailMessage } from '@shared/types'
import { CATEGORY_LABEL } from '@shared/classify'
import { useApp } from '../api'
import { AccountChip, relTime, fmtDateKey } from '../ui'

export function MailRow({
  m,
  a,
  account,
  onTask,
  showAccount = false
}: {
  m: MailMessage
  a: MailAnalysis
  account: Account
  onTask: () => void
  showAccount?: boolean
}) {
  const { openInService } = useApp()
  return (
    <div className={`item mail-item ${m.unread ? 'unread' : ''}`}>
      <div className="body">
        <div className="row between" style={{ gap: 8 }}>
          <span className="from" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.from}
          </span>
          <span className="small muted" style={{ flexShrink: 0 }}>
            {relTime(m.date)}
          </span>
        </div>
        <div className="subject">{m.subject}</div>
        {a.needsAction && a.action && <div className="todo">👉 {a.action}</div>}
        <div className="summary">{a.summary || m.snippet}</div>
        <div className="meta">
          {showAccount && <AccountChip account={account} />}
          <span className={`chip ${a.category === 'estatal' ? 'estatal' : ''}`}>{CATEGORY_LABEL[a.category]}</span>
          {a.importance !== 'baja' && <span className={`chip ${a.importance}`}>Importancia {a.importance}</span>}
          {a.deadline && <span className="chip alta">Plazo: {fmtDateKey(a.deadline)}</span>}
          {a.source === 'ia' && <span className="chip ia">IA</span>}
        </div>
      </div>
      <div className="actions" style={{ flexDirection: 'column' }}>
        <button className="icon-btn" title="Abrir el correo" onClick={() => openInService('correo', m.link, account.id)}>
          <ExternalLink size={15} />
        </button>
        <button className="icon-btn" title="Crear tarea con este correo" onClick={onTask}>
          <ListPlus size={15} />
        </button>
      </div>
    </div>
  )
}
