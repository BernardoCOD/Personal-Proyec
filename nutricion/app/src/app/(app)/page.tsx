import Link from 'next/link'
import { Suspense } from 'react'
import { AnilloCalorias, BarraMacro, fmt, NOMBRE_COMIDA, NOMBRE_OBJETIVO, Vacio } from '@/componentes/ui'
import { datosRegistrados } from '@/lib/datos'
import { esFechaValida, fechaLarga, horaEnZona, rangoDelDia, sumarDias } from '@/lib/fechas'
import { eliminarActividad, eliminarComida, eliminarItem } from './acciones'

export default function PaginaHoy({ searchParams }: PageProps<'/'>) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Panel searchParams={searchParams} />
    </Suspense>
  )
}

type Item = {
  id: string
  nombre_alimento: string
  cantidad: number
  unidad: string
  gramos: number
  calorias: number
  proteina_g: number
  carbohidratos_g: number
  grasa_g: number
}
type Comida = { id: string; fecha_hora: string; tipo: string; notas: string | null; comida_items: Item[] }
type Actividad = { id: string; fecha_hora: string; tipo: string; duracion_min: number; intensidad: string; calorias_estimadas: number | null }

async function Panel({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  const { supabase, perfil, objetivo, zona, hoy } = await datosRegistrados()
  const sp = await searchParams
  const fecha = esFechaValida(sp.fecha) ? sp.fecha : hoy
  const { desde, hasta } = rangoDelDia(fecha, zona)

  const [comidasR, actividadesR, pesoR] = await Promise.all([
    supabase.from('comidas')
      .select('id, fecha_hora, tipo, notas, comida_items(id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g)')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta)
      .order('fecha_hora').order('created_at', { referencedTable: 'comida_items' }),
    supabase.from('actividades').select('id, fecha_hora, tipo, duracion_min, intensidad, calorias_estimadas')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora'),
    supabase.from('mediciones_peso').select('peso_kg').eq('fecha', fecha).maybeSingle(),
  ])
  if (comidasR.error) throw new Error(comidasR.error.message)
  const comidas = (comidasR.data ?? []) as Comida[]
  const actividades = (actividadesR.data ?? []) as Actividad[]

  const total = { calorias: 0, proteina: 0, carbos: 0, grasas: 0 }
  for (const c of comidas) for (const i of c.comida_items) {
    total.calorias += Number(i.calorias)
    total.proteina += Number(i.proteina_g)
    total.carbos += Number(i.carbohidratos_g)
    total.grasas += Number(i.grasa_g)
  }
  const quemadas = actividades.reduce((s, a) => s + (a.calorias_estimadas ?? 0), 0)
  const esHoy = fecha === hoy

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <Link href={`/?fecha=${sumarDias(fecha, -1)}`} className="boton-secundario px-3" aria-label="Día anterior">‹</Link>
        <div className="text-center">
          <h1 className="text-lg font-bold first-letter:uppercase">{esHoy ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)}</h1>
          <p className="text-xs text-suave">
            {perfil.nombre ? `${perfil.nombre} · ` : ''}{NOMBRE_OBJETIVO[objetivo.tipo]}
            {!esHoy && <> · <Link href="/" className="text-acento underline">volver a hoy</Link></>}
          </p>
        </div>
        {fecha < hoy
          ? <Link href={`/?fecha=${sumarDias(fecha, 1)}`} className="boton-secundario px-3" aria-label="Día siguiente">›</Link>
          : <span className="w-[42px]" />}
      </header>

      <section className="tarjeta">
        <div className="flex items-center gap-4">
          <AnilloCalorias consumidas={total.calorias} meta={objetivo.meta_calorias} />
          <dl className="flex-1 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-suave">Meta</dt><dd className="font-medium">{fmt(objetivo.meta_calorias)} kcal</dd></div>
            <div className="flex justify-between"><dt className="text-suave">Consumidas</dt><dd className="font-medium">{fmt(total.calorias)} kcal</dd></div>
            <div className="flex justify-between"><dt className="text-suave">Ejercicio</dt><dd className="font-medium">{fmt(quemadas)} kcal</dd></div>
            {pesoR.data && (
              <div className="flex justify-between"><dt className="text-suave">Peso</dt><dd className="font-medium">{fmt(Number(pesoR.data.peso_kg), 1)} kg</dd></div>
            )}
          </dl>
        </div>
        <div className="mt-4 space-y-3">
          <BarraMacro nombre="Proteína" valor={total.proteina} meta={objetivo.meta_proteina_g} color="var(--proteina)" />
          <BarraMacro nombre="Carbohidratos" valor={total.carbos} meta={objetivo.meta_carbohidratos_g} color="var(--carbos)" />
          <BarraMacro nombre="Grasas" valor={total.grasas} meta={objetivo.meta_grasas_g} color="var(--grasas)" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Comidas</h2>
          <Link href={`/registrar?fecha=${fecha}`} className="text-sm font-medium text-acento">+ Agregar</Link>
        </div>
        {comidas.length === 0 && <Vacio>Aún no hay comidas registradas este día.</Vacio>}
        {comidas.map((c) => {
          const kcal = c.comida_items.reduce((s, i) => s + Number(i.calorias), 0)
          return (
            <article key={c.id} className="tarjeta">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{NOMBRE_COMIDA[c.tipo] ?? c.tipo}
                  <span className="ml-2 text-sm font-normal text-suave">{horaEnZona(c.fecha_hora, zona)}</span></h3>
                <span className="text-sm font-medium">{fmt(kcal)} kcal</span>
              </div>
              <ul className="divide-y divide-borde">
                {c.comida_items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{i.nombre_alimento}</p>
                      <p className="text-xs text-suave">
                        {fmt(Number(i.cantidad), 2)} {i.unidad}{i.unidad !== 'g' && ` (${fmt(Number(i.gramos))} g)`} ·
                        P {fmt(Number(i.proteina_g))} · C {fmt(Number(i.carbohidratos_g))} · G {fmt(Number(i.grasa_g))}
                      </p>
                    </div>
                    <span className="tabular-nums">{fmt(Number(i.calorias))}</span>
                    <BotonBorrar accion={eliminarItem} id={i.id} etiqueta={`Borrar ${i.nombre_alimento}`} />
                  </li>
                ))}
              </ul>
              {c.notas && <p className="mt-1 text-xs text-suave">{c.notas}</p>}
              <form action={eliminarComida} className="mt-2 text-right">
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs text-suave underline">Borrar comida completa</button>
              </form>
            </article>
          )
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Actividad física</h2>
          <Link href={`/registrar?tipo=actividad&fecha=${fecha}`} className="text-sm font-medium text-acento">+ Agregar</Link>
        </div>
        {actividades.length === 0 && <Vacio>Sin actividad registrada.</Vacio>}
        {actividades.length > 0 && (
          <ul className="tarjeta divide-y divide-borde py-1">
            {actividades.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1">
                  <p className="first-letter:uppercase">{a.tipo}</p>
                  <p className="text-xs text-suave">{horaEnZona(a.fecha_hora, zona)} · {a.duracion_min} min · intensidad {a.intensidad}</p>
                </div>
                {a.calorias_estimadas != null && <span className="tabular-nums">{fmt(a.calorias_estimadas)} kcal</span>}
                <BotonBorrar accion={eliminarActividad} id={a.id} etiqueta={`Borrar ${a.tipo}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function BotonBorrar({ accion, id, etiqueta }: { accion: (f: FormData) => Promise<void>; id: string; etiqueta: string }) {
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <button aria-label={etiqueta} title={etiqueta} className="rounded-lg p-1.5 text-suave hover:text-peligro">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  )
}

function Esqueleto() {
  return (
    <div className="animate-pulse space-y-4" aria-busy>
      <div className="mx-auto h-6 w-48 rounded bg-borde" />
      <div className="h-64 rounded-2xl bg-borde/60" />
      <div className="h-32 rounded-2xl bg-borde/60" />
    </div>
  )
}
