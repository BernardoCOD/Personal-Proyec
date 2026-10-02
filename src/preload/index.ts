import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Bridge } from '@shared/api'
import type { Snapshot } from '@shared/types'

// Puente mínimo entre la interfaz y el proceso principal.
const bridge: Bridge = {
  invoke: (method, args) => ipcRenderer.invoke('cdm:invoke', method, args),
  onSnapshot: (cb) => {
    const listener = (_e: IpcRendererEvent, s: Snapshot) => cb(s)
    ipcRenderer.on('cdm:snapshot', listener)
    return () => ipcRenderer.removeListener('cdm:snapshot', listener)
  },
  onNavigate: (cb) => {
    const listener = (_e: IpcRendererEvent, view: string) => cb(view)
    ipcRenderer.on('cdm:navigate', listener)
    return () => ipcRenderer.removeListener('cdm:navigate', listener)
  }
}

contextBridge.exposeInMainWorld('cdm', bridge)
