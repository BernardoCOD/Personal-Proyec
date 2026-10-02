import { useEffect, type ReactNode } from 'react'
import { LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { Account } from '@shared/types'

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" />
}

export function Alert({ kind = 'warn', children }: { kind?: 'warn' | 'error' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert ${kind === 'warn' ? '' : kind}`}>
      <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  )
}

export function AccountAvatar({ account, size = 20 }: { account: Account; size?: number }) {
  return (
    <span className="avatar" style={{ background: account.color, width: size, height: size, borderRadius: '50%', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: size * 0.55, fontWeight: 700 }}>
      {account.label.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function AccountChip({ account }: { account: Account }) {
  return (
    <span className="chip">
      <span className="dot" style={{ background: account.color }} />
      {account.label}
    </span>
  )
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export function relTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'ahora'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day')
  return dateFmt.format(new Date(iso))
}

export function fmtDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateFmt.format(new Date(y, m - 1, d))
}

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export const pct = (r: number): string => `${Math.round(r * 100)}%`
