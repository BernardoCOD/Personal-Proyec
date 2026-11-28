'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { diasEntre, mensajeComparacion, parInicial, VISTAS, type FotoInfo } from '@/lib/fotos'
import { eliminarFoto } from './acciones'

export type Foto = FotoInfo & { notas: string | null; url: string | null }

const FECHA = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const MES = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fecha = (f: string) => FECHA.format(new Date(`${f}T12:00:00Z`)).replace('.', '')
const nombreVista = (v: string) => VISTAS.find((x) => x.valor === v)?.nombre ?? v

export function Galeria({ fotos }: { fotos: Foto[] }) {
  const [abierta, setAbierta] = useState<Foto | null>(null)
  if (fotos.length === 0) return null

  // Agrupadas por mes, de la más reciente a la más antigua.
  const meses = new Map<string, Foto[]>()
  for (const f of fotos) meses.set(f.fecha.slice(0, 7), [...(meses.get(f.fecha.slice(0, 7)) ?? []), f])

  return (
    <>
      <Comparador fotos={fotos} />
      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Tus fotos ({fotos.length})</h2>
        <div className="space-y-4">
          {[...meses].map(([mes, lista]) => (
            <div key={mes}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-suave">{MES.format(new Date(`${mes}-15T12:00:00Z`))}</p>
              <div className="grid grid-cols-3 gap-2">
                {lista.map((f) => (
                  <button key={f.id} type="button" onClick={() => setAbierta(f)} className="overflow-hidden rounded-xl bg-fondo text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.url ? <img src={f.url} alt={`${nombreVista(f.vista)}, ${fecha(f.fecha)}`} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                      : <span className="grid aspect-[3/4] place-items-center text-xs text-suave">Sin imagen</span>}
                    <span className="block px-1.5 py-1 text-[11px] text-suave">{fecha(f.fecha)} · {nombreVista(f.vista)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {abierta && <VerFoto foto={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  )
}

function VerFoto({ foto, onCerrar }: { foto: Foto; onCerrar: () => void }) {
  const router = useRouter()
  const [borrando, iniciar] = useTransition()
  const [error, setError] = useState('')
  const borrar = () => {
    if (!confirm('¿Borrar esta foto? No se puede deshacer.')) return
    iniciar(async () => {
      const r = await eliminarFoto(foto.id)
      if (r.error) return setError(r.error)
      onCerrar()
      router.refresh()
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal aria-label="Foto">
      <div className="mb-3 flex items-center justify-between text-white">
        <div>
          <p className="font-semibold first-letter:uppercase">{fecha(foto.fecha)} · {nombreVista(foto.vista)}</p>
          <p className="text-xs text-white/70">{foto.peso_kg !== null ? `${foto.peso_kg} kg` : 'Sin peso'}{foto.notas ? ` · ${foto.notas}` : ''}</p>
        </div>
        <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-white/40">Cerrar</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {foto.url && <img src={foto.url} alt="" className="min-h-0 flex-1 rounded-xl object-contain" />}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <button type="button" onClick={borrar} disabled={borrando} className="mt-3 rounded-xl py-2.5 text-sm text-red-300 ring-1 ring-red-300/50">
        {borrando ? 'Borrando…' : 'Borrar foto'}
      </button>
    </div>
  )
}

/** Antes y después: lado a lado o con un deslizador encima. */
function Comparador({ fotos }: { fotos: Foto[] }) {
  const inicial = parInicial(fotos)
  const [antesId, setAntesId] = useState(inicial?.antes.id ?? '')
  const [despuesId, setDespuesId] = useState(inicial?.despues.id ?? '')
  const [modo, setModo] = useState<'lado' | 'deslizar'>('lado')
  const [pos, setPos] = useState(50)
  if (fotos.length < 2) {
    return (
      <section className="tarjeta text-sm text-suave">
        Cuando tengas dos fotos (idealmente con 4 semanas o más de diferencia) podrás compararlas aquí.
      </section>
    )
  }
  const porFecha = [...fotos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const antes = fotos.find((f) => f.id === antesId) ?? porFecha[0]
  const despues = fotos.find((f) => f.id === despuesId) ?? porFecha[porFecha.length - 1]
  const dias = Math.abs(diasEntre(antes.fecha, despues.fecha))
  const opcion = (f: Foto) => <option key={f.id} value={f.id}>{fecha(f.fecha)} · {nombreVista(f.vista)}</option>

  return (
    <section className="tarjeta space-y-3">
      <h2 className="font-semibold">Comparar</h2>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="etiqueta">Antes</span>
          <select className="campo py-2 text-sm" value={antes.id} onChange={(e) => setAntesId(e.target.value)}>{porFecha.map(opcion)}</select></label>
        <label><span className="etiqueta">Después</span>
          <select className="campo py-2 text-sm" value={despues.id} onChange={(e) => setDespuesId(e.target.value)}>{porFecha.map(opcion)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1 text-sm">
        {(['lado', 'deslizar'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setModo(m)} className={`rounded-lg py-1.5 font-medium ${modo === m ? 'bg-superficie shadow-sm' : 'text-suave'}`}>
            {m === 'lado' ? 'Lado a lado' : 'Deslizar'}
          </button>
        ))}
      </div>

      {modo === 'lado' ? (
        <div className="grid grid-cols-2 gap-2">
          {[antes, despues].map((f, i) => (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.url && <img src={f.url} alt={`${i ? 'Después' : 'Antes'}: ${fecha(f.fecha)}`} className="aspect-[3/4] w-full rounded-xl bg-fondo object-cover" />}
              <figcaption className="mt-1 text-center text-xs text-suave">
                <b className="text-texto">{i ? 'Después' : 'Antes'}</b> · {fecha(f.fecha)}{f.peso_kg !== null && ` · ${f.peso_kg} kg`}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div>
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-fondo select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {despues.url && <img src={despues.url} alt={`Después: ${fecha(despues.fecha)}`} className="absolute inset-0 h-full w-full object-cover" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {antes.url && <img src={antes.url} alt={`Antes: ${fecha(antes.fecha)}`} className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">Antes</span>
            <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">Después</span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Deslizar entre antes y después" className="mt-2 w-full accent-[var(--acento)]" />
        </div>
      )}

      <div className="rounded-xl bg-acento-suave p-3 text-sm text-acento">
        <p className="font-medium">{dias} {dias === 1 ? 'día' : 'días'} entre las fotos{antes.vista !== despues.vista && ' · ojo: son vistas distintas'}</p>
        <p>{mensajeComparacion(antes, despues)}</p>
      </div>
    </section>
  )
}
