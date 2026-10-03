import { useEffect, useState } from 'react'
import { Check, Copy, Link2, Plus, RefreshCw, Trash } from 'lucide-react'
import type { Account, Provider, Settings } from '@shared/types'
import type { SecretName } from '@shared/api'
import { ACCOUNT_COLORS, AI_MODELS } from '@shared/services'
import { api, useApp } from '../api'
import { AccountAvatar, Alert, Spinner, fmtDateTime } from '../ui'

export function SettingsView() {
  return (
    <div className="settings">
      <AccountsSection />
      <AiSection />
      <NotificationsSection />
      <NotionSection />
      <GeneralSection />
      <p className="small muted">
        Tus datos se guardan solo en esta computadora. Las claves y permisos se cifran con Windows. Nada se envía a terceros salvo lo que activas aquí (Gemini o
        Anthropic para los resúmenes, Notion y ntfy).
      </p>
    </div>
  )
}

function useSettings() {
  const { snap, run } = useApp()
  const s = snap.data.settings
  const save = (changes: Partial<Settings>, msg?: string) => run(api.updateSettings(changes), msg)
  return { s, save }
}

function SettingText({ label, field, placeholder, type = 'text' }: { label: string; field: keyof Settings; placeholder?: string; type?: string }) {
  const { s } = useSettings()
  const { toast } = useApp()
  const current = String(s[field] ?? '')
  const [value, setValue] = useState(current)
  useEffect(() => setValue(current), [current])
  return (
    <label className="field">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value === current) return
          const v = type === 'number' ? Number(value) : value
          api
            .updateSettings({ [field]: v } as Partial<Settings>)
            .then(() => toast('Guardado'))
            .catch((err: Error) => {
              toast(err.message, 'error')
              setValue(current)
            })
        }}
      />
    </label>
  )
}

function SettingToggle({ label, field, hint }: { label: string; field: keyof Settings; hint?: string }) {
  const { s, save } = useSettings()
  return (
    <label className="toggle">
      <input type="checkbox" checked={Boolean(s[field])} onChange={(e) => void save({ [field]: e.target.checked } as Partial<Settings>)} />
      <span>
        {label}
        {hint && <span className="small muted"> — {hint}</span>}
      </span>
    </label>
  )
}

function SecretField({ label, name, placeholder }: { label: string; name: SecretName; placeholder?: string }) {
  const { snap, run } = useApp()
  const [value, setValue] = useState('')
  const saved = snap.secrets[name]
  return (
    <div className="field">
      <span>
        {label} {saved && <span className="ok-text small">· guardado ✓</span>}
      </span>
      <div className="row">
        <input type="password" value={value} placeholder={saved ? '•••••••• (escribe para reemplazar)' : placeholder} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        <button
          className="btn"
          disabled={!value.trim()}
          onClick={() => void run(api.setSecret(name, value), 'Guardado de forma segura').then(() => setValue(''))}
        >
          Guardar
        </button>
        {saved && (
          <button className="icon-btn" title="Borrar" onClick={() => void run(api.setSecret(name, ''), 'Borrado')}>
            <Trash size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      <code>{text}</code>
      <button
        className="icon-btn"
        title="Copiar"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
      >
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  )
}

// ---------------- Cuentas ----------------

function AccountsSection() {
  const { snap, run } = useApp()
  const accounts = snap.data.accounts
  const [adding, setAdding] = useState<{ provider: Provider; label: string; email: string; color: string } | null>(null)

  const create = async (connect: boolean) => {
    if (!adding) return
    const acc = await run(api.addAccount(adding))
    if (!acc) return
    setAdding(null)
    if (connect) void run(api.connectAccount(acc.id), 'Cuenta conectada')
  }

  return (
    <section className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Cuentas de correo</h2>
        <button className="btn small primary" onClick={() => setAdding({ provider: 'google', label: '', email: '', color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length] })}>
          <Plus size={14} /> Agregar cuenta
        </button>
      </div>
      <p className="small text-2">
        Agrega cada correo con un nombre (Estudios, Trabajo, Juegos…). Arriba podrás cambiar entre ellas con un clic. Cada cuenta tiene su propia sesión, así que
        puedes tener las 4 abiertas a la vez.
      </p>

      {adding && (
        <div className="card stack" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div className="grid-2">
            <label className="field">
              Tipo
              <select value={adding.provider} onChange={(e) => setAdding({ ...adding, provider: e.target.value as Provider })}>
                <option value="google">Gmail / Google</option>
                <option value="microsoft">Outlook / Microsoft 365 (correo de la universidad)</option>
              </select>
            </label>
            <label className="field">
              Nombre de la cuenta
              <input type="text" autoFocus value={adding.label} placeholder="Ej.: Estudios" onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Correo (opcional; se completa solo al conectar)
            <input type="email" value={adding.email} placeholder="usuario@ucbvirtual.edu.pe" onChange={(e) => setAdding({ ...adding, email: e.target.value })} />
          </label>
          <div className="row wrap">
            <span className="small muted">Color:</span>
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAdding({ ...adding, color: c })}
                aria-label={`Color ${c}`}
                style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: adding.color === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }}
              />
            ))}
          </div>
          <div className="row wrap">
            <button className="btn primary" disabled={!adding.label.trim()} onClick={() => void create(true)}>
              <Link2 size={15} /> Agregar y conectar (con resúmenes)
            </button>
            <button className="btn" disabled={!adding.label.trim()} onClick={() => void create(false)}>
              Agregar solo web (sin resúmenes)
            </button>
            <button className="btn ghost" onClick={() => setAdding(null)}>
              Cancelar
            </button>
          </div>
          <p className="small muted">
            “Conectar” abre tu navegador para que inicies sesión y aceptes permisos de <strong>solo lectura</strong> (correo y calendario). Necesita las claves de
            abajo. “Solo web” funciona siempre, sin configurar nada.
          </p>
        </div>
      )}

      <div className="list">
        {accounts.length === 0 && !adding && <div className="empty">Todavía no agregaste cuentas.</div>}
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </div>

      <details className="guide">
        <summary>Claves para conectar cuentas de Google (Gmail)</summary>
        <ol>
          <li>
            Entra a <strong>console.cloud.google.com</strong> con tu Gmail principal y crea un proyecto llamado “Centro de Mando”.
          </li>
          <li>
            En <em>APIs y servicios → Biblioteca</em>, habilita <strong>Gmail API</strong> y <strong>Google Calendar API</strong>.
          </li>
          <li>
            En <em>Google Auth Platform</em> (pantalla de consentimiento): tipo <strong>Externo</strong>, nombre “Centro de Mando” y tu correo. En{' '}
            <em>Público</em> agrega tus 4 correos como usuarios de prueba y luego pulsa <strong>Publicar app</strong> (así el permiso no vence cada 7 días).
          </li>
          <li>
            En <em>Clientes → Crear cliente</em>, elige <strong>App de escritorio</strong>. Copia el <strong>ID de cliente</strong> y el{' '}
            <strong>Secreto del cliente</strong> aquí abajo.
          </li>
          <li>
            Al conectar, Google dirá “Google no verificó esta app”: es normal porque la app es tuya. Pulsa <em>Configuración avanzada → Ir a Centro de Mando</em>.
          </li>
        </ol>
      </details>
      <div className="grid-2">
        <SettingText label="Google · ID de cliente" field="googleClientId" placeholder="xxxx.apps.googleusercontent.com" />
        <SecretField label="Google · Secreto del cliente" name="googleClientSecret" placeholder="GOCSPX-…" />
      </div>

      <details className="guide">
        <summary>Claves para conectar el correo de Microsoft (universidad / Outlook)</summary>
        <ol>
          <li>
            Entra a <strong>entra.microsoft.com</strong> (o portal.azure.com) con una cuenta Microsoft personal → <em>Registros de aplicaciones → Nuevo registro</em>.
          </li>
          <li>
            Nombre “Centro de Mando”. Tipos de cuenta: <strong>cuentas de cualquier organización y cuentas Microsoft personales</strong>.
          </li>
          <li>
            URI de redirección: plataforma <strong>Cliente público/nativo (móvil y escritorio)</strong> con el valor <CopyText text="http://localhost" />
          </li>
          <li>
            En <em>Autenticación</em>, activa <strong>Permitir flujos de clientes públicos</strong>. Copia el <strong>Id. de aplicación (cliente)</strong> aquí abajo.
          </li>
          <li>
            Si al conectar tu correo de la universidad aparece “Se necesita la aprobación del administrador”, la universidad bloquea apps externas: usa la cuenta en
            modo <strong>solo web</strong> (Outlook dentro de la app, sin resúmenes) o pide a soporte de TI que la apruebe.
          </li>
        </ol>
      </details>
      <div className="grid-2">
        <SettingText label="Microsoft · Id. de aplicación (cliente)" field="microsoftClientId" placeholder="00000000-0000-0000-0000-000000000000" />
        <SettingText label="Microsoft · Inquilino" field="microsoftTenant" placeholder="common" />
      </div>
    </section>
  )
}

function AccountRow({ account }: { account: Account }) {
  const { snap, run } = useApp()
  const busy = snap.busy.includes(`cuenta:${account.id}`)
  const [label, setLabel] = useState(account.label)
  const digest = snap.data.mail[account.id]
  return (
    <div className="item" style={{ alignItems: 'center' }}>
      <AccountAvatar account={account} size={32} />
      <div className="body">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== account.label && void run(api.updateAccount(account.id, { label }))}
          style={{ fontWeight: 600, padding: '2px 6px', maxWidth: 260 }}
          aria-label="Nombre de la cuenta"
        />
        <div className="meta">
          <span>{account.email || 'correo sin definir'}</span>
          <span>· {account.provider === 'google' ? 'Google' : 'Microsoft'}</span>
          {account.connected ? <span className="ok-text">· conectada</span> : <span>· solo web</span>}
          {digest?.error && <span className="danger-text">· {digest.error}</span>}
        </div>
      </div>
      <div className="row">
        {account.connected ? (
          <>
            <button className="btn small" onClick={() => void run(api.refreshAccount(account.id))} disabled={busy}>
              {busy ? <Spinner size={13} /> : <RefreshCw size={13} />} Actualizar
            </button>
            <button className="btn small" onClick={() => void run(api.disconnectAccount(account.id), 'Cuenta desconectada')}>
              Desconectar
            </button>
          </>
        ) : (
          <button className="btn small primary" onClick={() => void run(api.connectAccount(account.id), 'Cuenta conectada')} disabled={busy}>
            {busy ? <Spinner size={13} /> : <Link2 size={13} />} {busy ? 'Esperando el navegador…' : 'Conectar'}
          </button>
        )}
        <button
          className="icon-btn"
          title="Quitar cuenta"
          onClick={() => {
            if (confirm(`¿Quitar la cuenta "${account.label}" de Centro de Mando? (No se borra nada de tu correo.)`)) void run(api.removeAccount(account.id), 'Cuenta quitada')
          }}
        >
          <Trash size={15} />
        </button>
      </div>
    </div>
  )
}

// ---------------- IA ----------------

function AiSection() {
  const { snap, run } = useApp()
  const { s, save } = useSettings()
  const [testing, setTesting] = useState(false)
  const gemini = s.aiProvider === 'gemini'
  const hasKey = gemini ? snap.secrets.geminiApiKey : snap.secrets.anthropicApiKey
  return (
    <section className="card stack">
      <h2>Inteligencia artificial (resúmenes)</h2>
      <SettingToggle label="Usar IA para resumir y clasificar correos y analizar hábitos" field="aiEnabled" hint="sin IA se usa una clasificación automática más simple" />
      <div className="tabs" style={{ width: 'fit-content' }}>
        <button className={gemini ? 'active' : ''} onClick={() => void save({ aiProvider: 'gemini' })}>
          Google Gemini (gratis)
        </button>
        <button className={!gemini ? 'active' : ''} onClick={() => void save({ aiProvider: 'anthropic' })}>
          Claude (de pago)
        </button>
      </div>

      {gemini ? (
        <>
          <div className="grid-2">
            <SecretField label="API key de Gemini" name="geminiApiKey" placeholder="AIza…" />
            <SettingText label="Modelo de Gemini" field="geminiModel" placeholder="gemini-2.5-flash" />
          </div>
          <details className="guide" open={!snap.secrets.geminiApiKey}>
            <summary>Cómo obtener la API key gratuita de Gemini</summary>
            <ol>
              <li>
                Entra a <strong>aistudio.google.com</strong> con tu cuenta de Google.
              </li>
              <li>
                Pulsa <strong>Get API key → Crear clave de API</strong>, copia la clave (empieza con <code>AIza</code>) y pégala arriba. No hace falta tarjeta.
              </li>
              <li>
                Pulsa <strong>Probar</strong>. Si el modelo indicado ya no existe, la app elige sola otro modelo “flash” disponible.
              </li>
            </ol>
          </details>
          <Alert kind="info">
            <strong>Ten en cuenta:</strong> en el plan gratuito, Google puede usar lo que envías para mejorar sus productos y hay un límite de consultas por
            día. Solo se envían remitente, asunto y primeras líneas de los correos nuevos. Si se alcanza el límite, la app usa la clasificación automática y
            reintenta en una hora.
          </Alert>
        </>
      ) : (
        <>
          <div className="grid-2">
            <SecretField label="API key de Anthropic" name="anthropicApiKey" placeholder="sk-ant-…" />
            <label className="field">
              Modelo
              <select value={s.aiModel} onChange={(e) => void save({ aiModel: e.target.value })}>
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="guide">
            <summary>Cómo obtener la API key de Anthropic y cuánto cuesta</summary>
            <ol>
              <li>
                Entra a <strong>console.anthropic.com</strong>, crea una cuenta y agrega saldo en <em>Billing</em> (por ejemplo 5 USD).
              </li>
              <li>
                En <em>API Keys → Create Key</em>, copia la clave (empieza con <code>sk-ant-</code>) y pégala arriba.
              </li>
              <li>
                Solo se analizan los correos <strong>nuevos</strong>. Con unos 50 correos nuevos al día el costo aproximado es de 4–5 USD al mes con Opus, y
                bastante menos con Sonnet o Haiku.
              </li>
            </ol>
          </details>
        </>
      )}

      <div className="row">
        <button
          className="btn"
          disabled={!hasKey || testing}
          onClick={async () => {
            setTesting(true)
            const r = await run(api.testAi())
            setTesting(false)
            if (r) alert(`La IA respondió: “${r}”`)
          }}
        >
          {testing && <Spinner />} Probar
        </button>
      </div>
    </section>
  )
}

// ---------------- Notificaciones ----------------

function NotificationsSection() {
  const { run } = useApp()
  const { s } = useSettings()
  return (
    <section className="card stack">
      <h2>Notificaciones (computadora y celular)</h2>
      <SettingToggle label="Notificaciones de Windows" field="desktopNotifications" />
      <SettingToggle label="Notificaciones al celular (con la app ntfy)" field="phoneNotifications" />
      <details className="guide" open={s.phoneNotifications}>
        <summary>Cómo recibir los avisos en el celular</summary>
        <ol>
          <li>
            Instala la app gratuita <strong>ntfy</strong> (ícono verde con una campana): en Android desde Play Store, en iPhone desde App Store. Su autor es
            Philipp Heckel.
          </li>
          <li>
            Ábrela y acepta el permiso de <strong>notificaciones</strong>.
          </li>
          <li>
            Toca <strong>+</strong> (Suscribirse a un tema) y escribe exactamente este tema: <CopyText text={s.ntfyTopic} />. Deja el servidor que viene por defecto y toca{' '}
            <strong>Suscribirse</strong>.
          </li>
          <li>
            En Android, activa <strong>Entrega instantánea</strong> en ese tema y, si el celular lo pide, permite que ntfy funcione sin restricción de batería
            (si no, los avisos pueden llegar con retraso).
          </li>
          <li>Aquí, activa “Notificaciones al celular” y pulsa <strong>Probar notificaciones</strong>: debe llegarte un aviso en segundos.</li>
          <li>
            El tema funciona como una contraseña: no lo compartas. Se envían solo títulos de tareas, recordatorios y asuntos de correos importantes.
          </li>
        </ol>
      </details>
      <div className="grid-2">
        <SettingText label="Tema de ntfy" field="ntfyTopic" />
        <SettingText label="Servidor de ntfy" field="ntfyServer" />
      </div>
      <div className="grid-2">
        <SettingText label="Resumen del día (hora)" field="dailyDigestTime" placeholder="08:00" type="time" />
        <SettingText label="Recordatorio de hábitos (hora)" field="habitReminderTime" placeholder="21:00" type="time" />
      </div>
      <SettingText label="Revisar correos cada (minutos)" field="mailRefreshMinutes" type="number" />
      <div className="row">
        <button className="btn" onClick={() => void run(api.testNotification(), 'Notificación enviada')}>
          Probar notificaciones
        </button>
      </div>
      <p className="small muted">
        Recibirás: recordatorios de tareas (por ejemplo “enviar correo a…”), el resumen del día, el aviso de hábitos pendientes y los correos nuevos de importancia
        alta.
      </p>
    </section>
  )
}

// ---------------- Notion ----------------

function NotionSection() {
  const { snap, run } = useApp()
  const { s, save } = useSettings()
  const [parent, setParent] = useState('')
  const [creating, setCreating] = useState(false)
  const syncing = snap.busy.includes('notion')
  return (
    <section className="card stack">
      <h2>Notion (tareas en el celular)</h2>
      <p className="small text-2">
        Tus tareas se copian a una base de datos de Notion. Desde la app de Notion en el celular puedes verlas, marcarlas como hechas o crear nuevas; los cambios
        vuelven aquí automáticamente cada 5 minutos.
      </p>
      <details className="guide" open={!s.notionDatabaseId}>
        <summary>Cómo conectar Notion</summary>
        <ol>
          <li>
            Entra a <strong>notion.so/profile/integrations</strong> → <em>Nueva integración</em> (tipo interna, en tu espacio). Copia el{' '}
            <strong>secreto de integración interna</strong> y guárdalo abajo.
          </li>
          <li>
            En Notion crea una página llamada “Centro de Mando”. En su menú <strong>···</strong> → <em>Conexiones</em>, agrega tu integración.
          </li>
          <li>
            Copia el enlace de esa página (<em>Compartir → Copiar enlace</em>), pégalo abajo y pulsa <strong>Crear base de datos</strong>.
          </li>
          <li>
            En el celular abre la base “Tareas · Centro de Mando” y márcala como <strong>favorita</strong> (⭐) para encontrarla siempre al abrir Notion.
          </li>
        </ol>
      </details>
      <SecretField label="Secreto de la integración de Notion" name="notionToken" placeholder="ntn_…" />
      {!s.notionDatabaseId ? (
        <div className="row">
          <input type="url" value={parent} placeholder="Enlace de la página de Notion" onChange={(e) => setParent(e.target.value)} />
          <button
            className="btn primary"
            disabled={!parent.trim() || !snap.secrets.notionToken || creating}
            onClick={async () => {
              setCreating(true)
              await run(api.notionCreateDatabase(parent), 'Base de datos creada en Notion')
              setCreating(false)
            }}
          >
            {creating && <Spinner />} Crear base de datos
          </button>
        </div>
      ) : (
        <>
          <SettingToggle label="Sincronizar tareas con Notion" field="notionEnabled" />
          <p className="small muted">
            Base de datos: <code>{s.notionDatabaseId}</code>{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                if (confirm('¿Desvincular esta base de datos? Las tareas no se borran.')) void save({ notionDatabaseId: '', notionEnabled: false })
              }}
            >
              desvincular
            </a>
          </p>
          {snap.data.notionLastSync && <p className="small muted">Última sincronización: {fmtDateTime(snap.data.notionLastSync)}</p>}
          {snap.data.notionLastError && <Alert kind="error">{snap.data.notionLastError}</Alert>}
          <div className="row">
            <button className="btn" disabled={syncing} onClick={() => void run(api.notionSyncNow()).then((r) => r && alert(`Notion: ${r}`))}>
              {syncing ? <Spinner /> : <RefreshCw size={15} />} Sincronizar ahora
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ---------------- General ----------------

function GeneralSection() {
  const { snap } = useApp()
  const { s, save } = useSettings()
  return (
    <section className="card stack">
      <h2>General</h2>
      <SettingToggle label="Abrir Centro de Mando al encender la computadora" field="launchAtStartup" hint="se inicia minimizado en la bandeja" />
      <SettingToggle label="Al cerrar la ventana, seguir en la bandeja" field="closeToTray" hint="necesario para recibir recordatorios" />
      <SettingToggle label="Mantener WhatsApp, Instagram y Facebook en segundo plano" field="backgroundMessaging" hint="para ver los mensajes sin leer" />
      <label className="field" style={{ maxWidth: 260 }}>
        Tema
        <select value={s.theme} onChange={(e) => void save({ theme: e.target.value as Settings['theme'] })}>
          <option value="sistema">Igual que Windows</option>
          <option value="claro">Claro</option>
          <option value="oscuro">Oscuro</option>
        </select>
      </label>
      {!snap.secrets.encryptionAvailable && <Alert>El cifrado del sistema no está disponible: las claves se guardan sin cifrar en esta computadora.</Alert>}
    </section>
  )
}
