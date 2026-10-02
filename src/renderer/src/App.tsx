import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { Calendar, Cloud, Flame, LayoutDashboard, ListTodo, Mail, MessageCircle, NotebookPen, Palette, RefreshCw, Settings as Gear, Camera, Users, ExternalLink } from 'lucide-react'
import { SERVICES, partitionFor, serviceById, unreadFromTitle, type ServiceDef, type ServiceId } from '@shared/services'
import type { Account, Snapshot } from '@shared/types'
import { toDateKey } from '@shared/dates'
import { api, Ctx, useSnapshotSource, type AppCtx, type Toast } from './api'
import { AccountAvatar, Spinner } from './ui'
import { Dashboard } from './views/Dashboard'
import { Tasks } from './views/Tasks'
import { Habits } from './views/Habits'
import { ServiceSummary } from './views/ServiceSummary'
import { SettingsView } from './views/Settings'

const SERVICE_ICONS: Record<ServiceId, typeof Mail> = {
  correo: Mail,
  calendario: Calendar,
  nube: Cloud,
  notion: NotebookPen,
  canva: Palette,
  whatsapp: MessageCircle,
  instagram: Camera,
  facebook: Users
}

/** Servicios que solo tienen la app web (no hay resumen disponible). */
const APP_ONLY: ServiceId[] = ['nube', 'canva']

interface OpenWeb {
  key: string
  serviceId: ServiceId
  partition: string
  src: string
}

export function App() {
  const snap = useSnapshotSource()
  if (!snap) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <Spinner size={28} />
      </div>
    )
  }
  return <Shell snap={snap} />
}

function Shell({ snap }: { snap: Snapshot }) {
  const { data } = snap
  const [view, setView] = useState('inicio')
  const [serviceTab, setServiceTab] = useState<Record<string, 'resumen' | 'app'>>({})
  const [webs, setWebs] = useState<OpenWeb[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const webRefs = useRef(new Map<string, WebviewTag>())
  const pendingLoads = useRef(new Map<string, string>())

  const active: Account | null = data.accounts.find((a) => a.id === data.activeAccountId) ?? data.accounts[0] ?? null

  // Tema claro / oscuro.
  useEffect(() => {
    const t = data.settings.theme
    if (t === 'sistema') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t === 'oscuro' ? 'dark' : 'light'
  }, [data.settings.theme])

  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 3500)
  }, [])

  const run = useCallback(
    async <T,>(p: Promise<T>, okText?: string): Promise<T | undefined> => {
      try {
        const v = await p
        if (okText) toast(okText)
        return v
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
        return undefined
      }
    },
    [toast]
  )

  const webKey = (svc: ServiceDef, acc: Account | null) => `${svc.id}|${partitionFor(svc, acc)}`

  const ensureWeb = useCallback((svc: ServiceDef, acc: Account | null, url?: string) => {
    const key = webKey(svc, acc)
    setWebs((ws) => {
      if (ws.some((w) => w.key === key)) return ws
      return [...ws, { key, serviceId: svc.id, partition: partitionFor(svc, acc), src: url ?? svc.url(acc) }]
    })
    if (url) {
      const el = webRefs.current.get(key)
      if (el) void el.loadURL(url).catch(() => undefined)
      else pendingLoads.current.set(key, url)
    }
    return key
  }, [])

  const navigate = useCallback((v: string) => setView(v), [])

  const openInService = useCallback(
    (serviceId: string, url: string, accountId?: string) => {
      const svc = serviceById(serviceId)
      if (!svc) return
      const acc = accountId ? data.accounts.find((a) => a.id === accountId) ?? active : active
      if (acc && svc.perAccount && acc.id !== data.activeAccountId) void api.setActiveAccount(acc.id)
      ensureWeb(svc, svc.perAccount ? acc : null, url)
      setServiceTab((t) => ({ ...t, [svc.id]: 'app' }))
      setView(`servicio:${svc.id}`)
    },
    [data.accounts, data.activeAccountId, active, ensureWeb]
  )

  // Navegación pedida desde una notificación.
  useEffect(() => window.cdm.onNavigate((v) => setView(v)), [])

  // WhatsApp, Instagram y Facebook se cargan en segundo plano para ver los no leídos.
  const bgLoaded = useRef(false)
  useEffect(() => {
    if (bgLoaded.current || !data.settings.backgroundMessaging) return
    bgLoaded.current = true
    for (const s of SERVICES.filter((x) => x.messaging)) ensureWeb(s, null)
  }, [data.settings.backgroundMessaging, ensureWeb])

  const service = view.startsWith('servicio:') ? serviceById(view.slice(9)) : undefined
  const tab = service ? (APP_ONLY.includes(service.id) ? 'app' : serviceTab[service.id] ?? 'resumen') : null
  const activeWebKey = service && tab === 'app' ? webKey(service, service.perAccount ? active : null) : null

  useEffect(() => {
    if (service && tab === 'app') ensureWeb(service, service.perAccount ? active : null)
  }, [service, tab, active, ensureWeb])

  // Un callback de ref estable por webview, para no volver a registrar eventos en cada render.
  const refCallbacks = useRef(new Map<string, (el: WebviewTag | null) => void>())
  const wired = useRef(new WeakSet<WebviewTag>())
  const attachWeb = (key: string) => {
    let cb = refCallbacks.current.get(key)
    if (!cb) {
      cb = (el: WebviewTag | null) => {
        if (!el) {
          webRefs.current.delete(key)
          return
        }
        webRefs.current.set(key, el)
        if (wired.current.has(el)) return
        wired.current.add(el)
        el.addEventListener('page-title-updated', (e) => {
          void api.setBadge(key, unreadFromTitle((e as unknown as { title: string }).title))
        })
        el.addEventListener('dom-ready', () => {
          const pending = pendingLoads.current.get(key)
          if (pending) {
            pendingLoads.current.delete(key)
            if (el.getURL() !== pending) void el.loadURL(pending).catch(() => undefined)
          }
        })
      }
      refCallbacks.current.set(key, cb)
    }
    return cb
  }

  const badgeFor = (svc: ServiceDef): number => {
    if (svc.id === 'correo') {
      return data.accounts.reduce((n, a) => {
        const digest = data.mail[a.id]
        if (a.connected && digest) return n + digest.unreadCount
        return n + (snap.badges[`correo|persist:acct-${a.id}`] ?? 0)
      }, 0)
    }
    if (svc.perAccount) return 0
    return snap.badges[`${svc.id}|${partitionFor(svc, null)}`] ?? 0
  }

  const ctx: AppCtx = useMemo(() => ({ snap, navigate, run, toast, openInService }), [snap, navigate, run, toast, openInService])

  const busyRefresh = data.accounts.some((a) => snap.busy.includes(`cuenta:${a.id}`))
  const showAccounts = data.accounts.length > 0 && (view === 'inicio' || service?.perAccount)

  const title = service
    ? service.name
    : { inicio: 'Inicio', tareas: 'Tareas y correos por hacer', habitos: 'Hábitos', ajustes: 'Ajustes' }[view] ?? 'Centro de Mando'

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="sidebar">
          <NavBtn label="Inicio" active={view === 'inicio'} onClick={() => setView('inicio')}>
            <LayoutDashboard size={22} />
          </NavBtn>
          <NavBtn
            label="Tareas"
            active={view === 'tareas'}
            onClick={() => setView('tareas')}
            badge={data.tasks.filter((t) => t.status !== 'hecha' && t.dueDate !== null && t.dueDate <= toDateKey(new Date())).length}
          >
            <ListTodo size={22} />
          </NavBtn>
          <NavBtn label="Hábitos" active={view === 'habitos'} onClick={() => setView('habitos')}>
            <Flame size={22} />
          </NavBtn>
          <div className="sep" />
          {SERVICES.map((s, i) => {
            const Icon = SERVICE_ICONS[s.id]
            return (
              <div key={s.id} style={{ display: 'contents' }}>
                {(i === 3 || i === 5) && <div className="sep" />}
                <NavBtn label={s.name} active={view === `servicio:${s.id}`} onClick={() => setView(`servicio:${s.id}`)} badge={badgeFor(s)}>
                  <span className="svc-dot" style={{ background: s.color }}>
                    <Icon size={18} />
                  </span>
                </NavBtn>
              </div>
            )
          })}
          <div className="grow" />
          <NavBtn label="Ajustes" active={view === 'ajustes'} onClick={() => setView('ajustes')}>
            <Gear size={22} />
          </NavBtn>
        </nav>

        <div className="main">
          <header className="topbar">
            <div className="title">
              <h1>{title}</h1>
              {service?.perAccount && active && <small>{active.email || active.label}</small>}
            </div>
            {service && !APP_ONLY.includes(service.id) && (
              <div className="tabs">
                <button className={tab === 'resumen' ? 'active' : ''} onClick={() => setServiceTab((t) => ({ ...t, [service.id]: 'resumen' }))}>
                  Resumen
                </button>
                <button className={tab === 'app' ? 'active' : ''} onClick={() => setServiceTab((t) => ({ ...t, [service.id]: 'app' }))}>
                  Abrir {service.name}
                </button>
              </div>
            )}
            {service && tab === 'app' && (
              <button className="icon-btn" title="Abrir en el navegador" onClick={() => void run(api.openExternal(webRefs.current.get(activeWebKey ?? '')?.getURL() || service.url(active)))}>
                <ExternalLink size={18} />
              </button>
            )}
            {showAccounts && (
              <div className="account-chips">
                {data.accounts.map((a) => (
                  <button
                    key={a.id}
                    className={`account-chip ${a.id === active?.id ? 'active' : ''}`}
                    onClick={() => void run(api.setActiveAccount(a.id))}
                    title={`${a.email || 'sin correo'} · ${a.provider === 'google' ? 'Google' : 'Microsoft'}`}
                  >
                    <AccountAvatar account={a} />
                    {a.label}
                  </button>
                ))}
                {data.accounts.some((a) => a.connected) && (
                  <button className="icon-btn" title="Actualizar correos y calendario" onClick={() => void run(api.refreshAccount())} disabled={busyRefresh}>
                    {busyRefresh ? <Spinner /> : <RefreshCw size={18} />}
                  </button>
                )}
              </div>
            )}
          </header>

          <div className={`content ${activeWebKey ? 'flush' : ''}`}>
            <div className="webview-layer" style={{ pointerEvents: activeWebKey ? 'auto' : 'none', zIndex: activeWebKey ? 1 : 0 }}>
              {webs.map((w) => (
                <webview
                  key={w.key}
                  ref={attachWeb(w.key) as unknown as React.Ref<HTMLElement>}
                  src={w.src}
                  partition={w.partition}
                  allowpopups
                  className={w.key === activeWebKey ? '' : 'hidden'}
                />
              ))}
            </div>
            {!activeWebKey && (
              <div style={{ position: 'relative', zIndex: 2 }}>
                {view === 'inicio' && <Dashboard />}
                {view === 'tareas' && <Tasks />}
                {view === 'habitos' && <Habits />}
                {view === 'ajustes' && <SettingsView />}
                {service && <ServiceSummary service={service} account={service.perAccount ? active : null} openApp={() => setServiceTab((t) => ({ ...t, [service.id]: 'app' }))} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

function NavBtn({ label, active, onClick, badge = 0, children }: { label: string; active: boolean; onClick: () => void; badge?: number; children: React.ReactNode }) {
  return (
    <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick} aria-label={label} title={label}>
      {children}
      {badge > 0 && <span className="badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}
