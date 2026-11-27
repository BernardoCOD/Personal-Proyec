import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { clienteServidor } from '@/lib/supabase/servidor'
import { decidir } from './acciones'

export const metadata: Metadata = { title: 'Conectar con Claude' }

export default function PaginaPermiso({ searchParams }: PageProps<'/oauth/consent'>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Suspense fallback={<div className="tarjeta h-80 animate-pulse" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function Contenido({ searchParams }: { searchParams: PageProps<'/oauth/consent'>['searchParams'] }) {
  const sp = await searchParams
  const authorizationId = typeof sp.authorization_id === 'string' ? sp.authorization_id : ''
  if (!authorizationId) return <Aviso titulo="Falta información">Abre este enlace desde Claude al conectar Nutri.</Aviso>

  const supabase = await clienteServidor()
  const { data: sesion } = await supabase.auth.getClaims()
  if (!sesion?.claims?.sub) {
    redirect(`/login?volver=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`)
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    return <Aviso titulo="El enlace venció">Vuelve a Claude e intenta conectar Nutri otra vez.</Aviso>
  }
  // Ya lo habías aprobado antes: se vuelve directo a Claude.
  if (!('authorization_id' in data)) redirect(data.redirect_url)

  const cliente = data.client?.name || 'Una aplicación'
  let destino = ''
  try { destino = new URL(data.redirect_uri).host } catch { /* sin dato */ }

  return (
    <div className="tarjeta space-y-4">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" width={56} height={56} className="mx-auto mb-2" />
        <h1 className="text-xl font-bold">Conectar con Nutri</h1>
        <p className="mt-1 text-suave"><b className="text-texto">{cliente}</b> quiere usar tu cuenta de Nutri{data.user?.email ? <> ({data.user.email})</> : null}.</p>
      </div>
      <div className="rounded-xl bg-fondo p-3 text-sm">
        <p className="mb-1 font-medium">Podrá, solo con tus datos:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-suave">
          <li>Buscar alimentos y registrar tus comidas</li>
          <li>Ver tu resumen del día, tu objetivo y tu historial</li>
          <li>Registrar actividad física y tu peso</li>
          <li>Corregir o borrar lo que registró</li>
        </ul>
        {destino && <p className="mt-2 text-xs text-suave">Volverás a: {destino}</p>}
      </div>
      {sp.error && <p role="alert" className="text-sm text-peligro">No se pudo completar. Intenta de nuevo.</p>}
      <form action={decidir} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button name="decision" value="rechazar" className="boton-secundario">Cancelar</button>
        <button name="decision" value="aprobar" className="boton">Permitir</button>
      </form>
      <p className="text-center text-xs text-suave">Puedes quitar este acceso cuando quieras desde la configuración de Claude.</p>
    </div>
  )
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="tarjeta text-center">
      <h1 className="mb-1 text-lg font-bold">{titulo}</h1>
      <p className="text-suave">{children}</p>
    </div>
  )
}
