import type { Metadata } from 'next'
import { Suspense } from 'react'
import { datosRegistrados } from '@/lib/datos'
import { fechaLarga } from '@/lib/fechas'
import { BUCKET_FOTOS, proximaFoto, type FotoInfo } from '@/lib/fotos'
import { Galeria, type Foto } from './galeria'
import { SubirFoto } from './subir'
import { TabsProgreso } from '@/componentes/tabs-progreso'

export const metadata: Metadata = { title: 'Fotos' }

export default function PaginaFotos() {
  return (
    <>
      <TabsProgreso actual="fotos" />
      <p className="-mt-1 mb-4 text-sm text-suave">Solo tú puedes verlas. Tómalas con la misma luz, ropa y pose para comparar mejor.</p>
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </>
  )
}

async function Contenido() {
  const { supabase, usuarioId, hoy, ultimoPeso } = await datosRegistrados()
  const { data } = await supabase.from('fotos_progreso')
    .select('id, fecha, vista, ruta, peso_kg, notas').order('fecha', { ascending: false }).order('created_at', { ascending: false })
  const filas = data ?? []

  // Enlaces temporales (1 hora): el bucket es privado y no hay enlaces públicos.
  const firmadas = filas.length
    ? (await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(filas.map((f) => f.ruta), 3600)).data ?? []
    : []
  const url = new Map(firmadas.map((s) => [s.path, s.signedUrl]))
  const fotos: Foto[] = filas.map((f) => ({
    id: f.id, fecha: f.fecha, vista: f.vista as FotoInfo['vista'], peso_kg: f.peso_kg === null ? null : Number(f.peso_kg),
    notas: f.notas, url: url.get(f.ruta) ?? null,
  }))
  const proxima = proximaFoto(fotos, hoy)

  return (
    <div className="space-y-4">
      <section className={`tarjeta ${proxima.toca ? 'border-acento' : ''}`}>
        <p className="text-sm">
          {fotos.length === 0
            ? <>📸 <b>Toma tu primera foto</b>: será tu punto de partida.</>
            : proxima.toca
              ? <>📸 <b>¡Toca tu foto de progreso!</b> Ya pasaron 4 semanas desde la última.</>
              : <>Próxima foto sugerida: <b className="first-letter:uppercase">{fechaLarga(proxima.fecha)}</b> (en {proxima.diasFaltan} {proxima.diasFaltan === 1 ? 'día' : 'días'}).</>}
        </p>
        <SubirFoto usuarioId={usuarioId} hoy={hoy} pesoKg={ultimoPeso.pesoKg} />
      </section>
      <Galeria fotos={fotos} />
    </div>
  )
}
