import { createContext, useContext, useEffect, useState } from 'react'
import type { Api, ApiMethod } from '@shared/api'
import type { Snapshot } from '@shared/types'

/** Llama al proceso principal. Los errores llegan como Error con mensaje en español. */
export const api = new Proxy({} as Api, {
  get: (_target, method: string) => async (...args: unknown[]) => {
    const r = await window.cdm.invoke(method as ApiMethod, args)
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
})

export function useSnapshotSource(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    let alive = true
    const off = window.cdm.onSnapshot((s) => alive && setSnap(s))
    void api.getSnapshot().then((s) => alive && setSnap(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  return snap
}

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

export interface AppCtx {
  snap: Snapshot
  navigate: (view: string) => void
  /** Ejecuta una acción mostrando el error (o un mensaje de éxito) como aviso. */
  run: <T>(p: Promise<T>, okText?: string) => Promise<T | undefined>
  toast: (text: string, kind?: 'ok' | 'error') => void
  /** Abre una URL dentro de la app web de un servicio (p. ej. un correo o redactar). */
  openInService: (serviceId: string, url: string, accountId?: string) => void
}

export const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('Contexto no disponible')
  return c
}

export const now = (): Date => new Date()
