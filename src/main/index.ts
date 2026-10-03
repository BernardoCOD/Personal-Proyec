import { app, BrowserWindow, ipcMain, Menu, nativeImage, session, shell, Tray, type Session } from 'electron'
import { join } from 'node:path'
import iconPath from '../../resources/icon.png?asset'
import trayPath from '../../resources/tray.png?asset'
import type { Api, ApiMethod, InvokeResult } from '@shared/api'
import type { Settings } from '@shared/types'
import { isAuthHost } from '@shared/services'
import { Store } from './store'
import { Secrets } from './secrets'
import { Notifier } from './notify'
import { Controller } from './controller'

// Una sola instancia: si se abre otra vez, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Las webs (WhatsApp, Google...) deben vernos como un Chrome normal.
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|centro-de-mando|Centro de Mando)\/\S+/gi, '')
app.setAppUserModelId('com.bernardocod.centrodemando')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let controller: Controller

const API_METHODS: ApiMethod[] = [
  'getSnapshot', 'addAccount', 'connectAccount', 'disconnectAccount', 'updateAccount', 'removeAccount',
  'setActiveAccount', 'refreshAccount', 'saveTask', 'deleteTask', 'saveHabit', 'archiveHabit', 'moveHabit',
  'toggleHabit', 'saveReflection', 'updateSettings', 'setSecret', 'testAi', 'testNotification',
  'notionCreateDatabase', 'notionSyncNow', 'setBadge', 'openExternal'
]

function showWindow(view?: string): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (view) win.webContents.send('cdm:navigate', view)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Centro de Mando',
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  win.once('ready-to-show', () => {
    if (!process.argv.includes('--oculto')) win?.show()
  })

  win.on('close', (e) => {
    if (!quitting && controller.snapshotSync().data.settings.closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })

  // Enlaces de la interfaz: siempre en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(trayPath))
  tray.setToolTip('Centro de Mando')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Centro de Mando', click: () => showWindow() },
      { label: 'Tareas', click: () => showWindow('tareas') },
      { label: 'Hábitos', click: () => showWindow('habitos') },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showWindow())
}

function applySystemSettings(s: Settings): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: s.launchAtStartup, args: ['--oculto'] })
}

/** Seguridad y permisos de las apps web incrustadas (WhatsApp, Gmail, etc.). */
function hardenWebviews(): void {
  const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen', 'media'])
  const configure = (s: Session) => {
    s.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)))
  }
  configure(session.defaultSession)
  app.on('session-created', configure)

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      // Las webs incrustadas nunca tienen acceso a Node ni a la app.
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      if (!params.src.startsWith('https://') || !params.partition?.startsWith('persist:')) event.preventDefault()
    })

    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url, disposition }) => {
        let host = ''
        try {
          host = url === 'about:blank' ? '' : new URL(url).hostname
        } catch {
          return { action: 'deny' }
        }
        // Ventanas de inicio de sesión (Google, Microsoft, Apple, Notion...): se abren dentro
        // de la app con la misma sesión. Muchas empiezan vacías (about:blank) o se abren como
        // ventana emergente con tamaño propio ("new-window").
        if (url === 'about:blank' || isAuthHost(host) || disposition === 'new-window') {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } }
        }
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
      })
    }
  })
}

app.on('second-instance', () => showWindow())

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  const store = new Store()
  const secrets = new Secrets()
  const notifier = new Notifier(
    () => store.get().settings,
    (view) => showWindow(view)
  )

  let pending: NodeJS.Timeout | null = null
  const emit = (): void => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      win?.webContents.send('cdm:snapshot', controller.snapshotSync())
    }, 40)
  }
  controller = new Controller(store, secrets, notifier, emit, applySystemSettings)
  store.onChange(emit)

  ipcMain.handle('cdm:invoke', async (event, method: ApiMethod, args: unknown[]): Promise<InvokeResult> => {
    if (event.sender !== win?.webContents) return { ok: false, error: 'Origen no permitido.' }
    if (!API_METHODS.includes(method)) return { ok: false, error: `Función desconocida: ${String(method)}` }
    try {
      const fn = controller[method] as (...a: unknown[]) => Promise<unknown>
      const value = await fn.apply(controller, Array.isArray(args) ? args : [])
      return { ok: true, value }
    } catch (err) {
      console.error(`Error en ${method}:`, err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  hardenWebviews()
  createWindow()
  createTray()
  applySystemSettings(store.get().settings)

  if (store.loadWarning) {
    void notifier.send({ title: 'Centro de Mando', body: store.loadWarning, phone: false })
  }

  const tick = () => void controller.tick().catch((err: unknown) => console.error('Error en tareas periódicas', err))
  setTimeout(tick, 5_000)
  setInterval(tick, 30_000)

  app.on('activate', () => showWindow())
  app.on('will-quit', () => store.flush())
})

// En Windows la app sigue en la bandeja aunque se cierre la ventana.
app.on('window-all-closed', () => {
  if (quitting) app.quit()
})

export type { Api }
