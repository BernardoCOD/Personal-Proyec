import Link from 'next/link'
import { Suspense } from 'react'
import { AnilloCalorias, BarraMacro, fmt, NOMBRE_OBJETIVO, Vacio } from '@/componentes/ui'
import { datosRegistrados } from '@/lib/datos'
import { esFechaValida, fechaLarga, horaEnZona, rangoDelDia } from '@/lib/fechas'
import { Llama } from '@/componentes/racha'
import { SemanaTira } from '@/componentes/semana'
import { cargarProgreso } from '@/lib/progreso'
import { REGLAS } from '@/lib/racha'
import { eliminarActividad, eliminarItem } from './acciones'

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

/** Las 4 secciones del día y qué parte de las calorías se sugiere para cada una. */
const SECCIONES = [
  { tipo: 'desayuno', nombre: 'Desayuno', icono: '☕', pct: 0.25, vacio: 'Agrega lo que desayunaste' },
  { tipo: 'almuerzo', nombre: 'Almuerzo', icono: '🍲', pct: 0.35, vacio: 'Agrega tu almuerzo' },
  { tipo: 'cena', nombre: 'Cena', icono: '🌙', pct: 0.25, vacio: 'Agrega tu cena' },
  { tipo: 'snack', nombre: 'Snacks', icono: '🍎', pct: 0.15, vacio: 'Media mañana, media tarde…' },
] as const

async function Panel({ searchParams }: { searchParams: PageProps<'/'>['searchParams'] }) {
  const { supabase, perfil, objetivo, zona, hoy } = await datosRegistrados()
  const sp = await searchParams
  const fecha = esFechaValida(sp.fecha) ? sp.fecha : hoy
  const { desde, hasta } = rangoDelDia(fecha, zona)

  const [comidasR, actividadesR, pesoR, progreso] = await Promise.all([
    supabase.from('comidas')
      .select('id, fecha_hora, tipo, notas, comida_items(id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g)')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta)
      .order('fecha_hora').order('created_at', { referencedTable: 'comida_items' }),
    supabase.from('actividades').select('id, fecha_hora, tipo, duracion_min, intensidad, calorias_estimadas')
      .gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora'),
    supabase.from('mediciones_peso').select('peso_kg').eq('fecha', fecha).maybeSingle(),
    cargarProgreso(supabase, hoy, 1),
  ])
  if (comidasR.error) throw new Error(comidasR.error.message)
  const comidas = (comidasR.data ?? []) as Comida[]
  const actividades = (actividadesR.data ?? []) as Actividad[]

  // Todo lo de un mismo tipo va en una sola sección, aunque se haya guardado en partes.
  const porTipo = new Map<string, { items: Item[]; notas: string[]; primeraHora: string | null }>()
  for (const c of comidas) {
    const s = porTipo.get(c.tipo) ?? { items: [], notas: [], primeraHora: null }
    s.items.push(...c.comida_items)
    if (c.notas) s.notas.push(c.notas)
    s.primeraHora ??= c.fecha_hora
    porTipo.set(c.tipo, s)
  }

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
        <div>
          <h1 className="text-2xl font-bold">{esHoy ? 'Hoy' : <span className="first-letter:uppercase">{fechaLarga(fecha).split(' ')[0]}</span>}</h1>
          <p className="text-xs text-suave first-letter:uppercase">
            {esHoy ? fechaLarga(fecha) : fechaLarga(fecha).split(' ').slice(1).join(' ')} · {NOMBRE_OBJETIVO[objetivo.tipo]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums" title={`${progreso.registro.actual} días seguidos registrando`}>
            <Llama tipo="registro" apagada={progreso.registro.actual === 0} className="h-6 w-6" />{progreso.registro.actual}
          </span>
          <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums" title={`${progreso.cumplimiento.actual} días seguidos cumpliendo tus metas`}>
            <Llama tipo="cumplimiento" apagada={progreso.cumplimiento.actual === 0} className="h-6 w-6" />{progreso.cumplimiento.actual}
          </span>
          <Link href="/perfil" aria-label="Mi perfil"
            className="ml-1 grid h-10 w-10 place-items-center rounded-full bg-secundario text-base font-bold text-white">
            {(perfil.nombre ?? '?').trim().charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      <SemanaTira fecha={fecha} hoy={hoy} estados={progreso.estados} />

      {esHoy && !progreso.registro.hoyCuenta && (
        <p className="rounded-xl bg-acento-suave px-3 py-2 text-center text-sm text-acento">
          Registra al menos {REGLAS.seccionesMinimas} comidas hoy para {progreso.registro.actual > 0 ? 'mantener tu racha' : 'empezar una racha'} 🔥
        </p>
      )}
      {!esHoy && <Link href="/" className="block text-center text-sm font-medium text-acento">Volver a hoy</Link>}

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

      {SECCIONES.map((s) => {
        const datos = porTipo.get(s.tipo)
        const items = datos?.items ?? []
        const kcal = items.reduce((t, i) => t + Number(i.calorias), 0)
        const sugeridas = Math.round((objetivo.meta_calorias * s.pct) / 10) * 10
        const macros = items.reduce(
          (t, i) => ({ p: t.p + Number(i.proteina_g), c: t.c + Number(i.carbohidratos_g), g: t.g + Number(i.grasa_g) }),
          { p: 0, c: 0, g: 0 },
        )
        const agregar = `/registrar?comida=${s.tipo}&fecha=${fecha}`
        return (
          <section key={s.tipo} className="tarjeta" aria-labelledby={`sec-${s.tipo}`}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-acento-suave text-xl" aria-hidden>{s.icono}</span>
              <div className="min-w-0 flex-1">
                <h2 id={`sec-${s.tipo}`} className="font-semibold">
                  {s.nombre}
                  {datos?.primeraHora && <span className="ml-2 text-xs font-normal text-suave">{horaEnZona(datos.primeraHora, zona)}</span>}
                </h2>
                <p className="text-xs text-suave">
                  <span className={kcal > sugeridas * 1.15 ? 'font-medium text-peligro' : kcal > 0 ? 'font-medium text-texto' : ''}>{fmt(kcal)}</span>
                  {' '}/ {fmt(sugeridas)} kcal sugeridas
                </p>
              </div>
              <Link href={agregar} aria-label={`Agregar a ${s.nombre}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-acento text-2xl leading-none text-sobre-acento active:scale-95">+</Link>
            </div>

            {items.length === 0 ? (
              <Link href={agregar} className="mt-3 block rounded-xl border border-dashed border-borde p-3 text-center text-sm text-suave">
                {s.vacio}
              </Link>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-borde">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center gap-1">
                      <Link href={`/item/${i.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{i.nombre_alimento}</p>
                          <p className="text-xs text-suave">
                            {fmt(Number(i.cantidad), 2)} {i.unidad}{i.unidad !== 'g' && ` (${fmt(Number(i.gramos))} g)`}
                          </p>
                        </div>
                        <span className="tabular-nums">{fmt(Number(i.calorias))} kcal</span>
                      </Link>
                      <BotonBorrar accion={eliminarItem} id={i.id} etiqueta={`Borrar ${i.nombre_alimento}`} />
                    </li>
                  ))}
                </ul>
                <p className="mt-1 flex gap-3 border-t border-borde pt-2 text-xs text-suave">
                  <span><b className="text-proteina">P</b> {fmt(macros.p)} g</span>
                  <span><b className="text-carbos">C</b> {fmt(macros.c)} g</span>
                  <span><b className="text-grasas">G</b> {fmt(macros.g)} g</span>
                </p>
                {datos!.notas.length > 0 && <p className="mt-1 text-xs text-suave">{datos!.notas.join(' · ')}</p>}
              </>
            )}
          </section>
        )
      })}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">🏃 Ejercicio</h2>
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
      <button aria-label={etiqueta} title={etiqueta} className="rounded-lg p-2 text-suave hover:text-peligro">
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
      {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-borde/60" />)}
    </div>
  )
}
