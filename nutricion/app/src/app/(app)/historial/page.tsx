import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BarrasSemanas, Comparacion, Leyenda, pct, TarjetaRacha } from '@/componentes/progreso'
import { CeldaDia, TEXTO_ESTADO } from '@/componentes/racha'
import { TabsProgreso } from '@/componentes/tabs-progreso'
import { NOMBRE_OBJETIVO } from '@/componentes/ui'
import { fmt, Vacio } from '@/componentes/ui'
import { datosRegistrados } from '@/lib/datos'
import { fechaCorta, sumarDias } from '@/lib/fechas'
import { cargarProgreso } from '@/lib/progreso'
import { proximaFoto } from '@/lib/fotos'
import { REGLAS, TEXTO_REGLAS } from '@/lib/racha'

export const metadata: Metadata = { title: 'Progreso' }

export default function PaginaProgreso() {
  return (
    <>
      <TabsProgreso actual="resumen" />
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </>
  )
}

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const NOMBRE_DIA = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

async function Contenido() {
  const { supabase, hoy, objetivo, ultimoPeso } = await datosRegistrados()
  const [progreso, pesosR, fotosR] = await Promise.all([
    cargarProgreso(supabase, hoy, 8),
    supabase.from('mediciones_peso').select('fecha, peso_kg').gte('fecha', sumarDias(hoy, -180)).order('fecha'),
    supabase.from('fotos_progreso').select('fecha'),
  ])
  const { registro, cumplimiento, semanas, porFecha, estados } = progreso
  const actual = semanas[semanas.length - 1]
  const anterior = semanas[semanas.length - 2]
  const pesos = (pesosR.data ?? []).map((p) => ({ fecha: p.fecha as string, kg: Number(p.peso_kg) }))
  const dias = [...porFecha.values()].filter((d) => d.fecha >= sumarDias(hoy, -29)).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const hayDatos = porFecha.size > 0
  const foto = proximaFoto((fotosR.data ?? []) as { fecha: string }[], hoy)
  // Peso al empezar la etapa (el último registrado antes o ese día; si no, el primero de la lista).
  const inicioEtapa = [...pesos].reverse().find((p) => p.fecha <= objetivo.fecha_inicio) ?? pesos[0]
  const cambioEtapa = inicioEtapa ? ultimoPeso.pesoKg - inicioEtapa.kg : null

  return (
    <div className="space-y-4">
      {/* Peso y objetivo */}
      <section className="tarjeta">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-suave">Objetivo</p>
            <p className="text-lg font-semibold">{NOMBRE_OBJETIVO[objetivo.tipo]}</p>
            <p className="text-xs text-suave">Desde el {fechaCorta(objetivo.fecha_inicio)}{objetivo.fecha_fin ? ` hasta el ${fechaCorta(objetivo.fecha_fin)}` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">{fmt(ultimoPeso.pesoKg, 1)}<span className="text-base font-medium text-suave"> kg</span></p>
            <p className="text-xs text-suave">
              {cambioEtapa === null || Math.abs(cambioEtapa) < 0.05 ? 'Sin cambios en esta etapa'
                : `${cambioEtapa > 0 ? '+' : ''}${fmt(cambioEtapa, 1)} kg en esta etapa`}
            </p>
          </div>
        </div>
        <Link href="/registrar?tipo=peso" className="boton mt-3 w-full">+ Actualizar peso</Link>
      </section>

      {/* Rachas */}
      <section className="grid grid-cols-2 gap-3" aria-label="Rachas">
        <TarjetaRacha tipo="registro" titulo="Registrando" racha={registro}
          ayuda={registro.hoyCuenta ? 'Hoy ya suma' : `Registra ${REGLAS.seccionesMinimas} comidas hoy para sumar`} />
        <TarjetaRacha tipo="cumplimiento" titulo="Cumpliendo metas" racha={cumplimiento}
          ayuda={cumplimiento.hoyCuenta ? 'Hoy ya suma' : 'Kcal y macros dentro de tus metas'} />
      </section>

      {foto.toca && (
        <Link href="/fotos" className="tarjeta flex items-center gap-3 border-acento">
          <span className="text-2xl" aria-hidden>📸</span>
          <span className="flex-1 text-sm">
            <b>{(fotosR.data ?? []).length === 0 ? 'Toma tu primera foto de progreso' : '¡Toca tu foto de progreso!'}</b>
            <span className="block text-suave">Compararla con la anterior te ayuda a ver cambios que la báscula no muestra.</span>
          </span>
          <span className="text-acento" aria-hidden>›</span>
        </Link>
      )}

      {/* Esta semana vs la anterior */}
      <section className="tarjeta">
        <h2 className="font-semibold">Esta semana vs la anterior</h2>
        <p className="mb-3 text-xs text-suave">Semana del {fechaCorta(actual.lunes)} (van {actual.dias} {actual.dias === 1 ? 'día' : 'días'}) frente a la del {fechaCorta(anterior.lunes)}</p>
        <div className="grid grid-cols-2 gap-3">
          <Comparacion titulo="Días registrados" ahora={pct(actual.registrados, actual.dias)} antes={pct(anterior.registrados, anterior.dias)}
            detalle={`${actual.registrados} de ${actual.dias} · antes ${anterior.registrados} de ${anterior.dias}`} />
          <Comparacion titulo="Días cumplidos" ahora={pct(actual.cumplidos, actual.dias)} antes={pct(anterior.cumplidos, anterior.dias)}
            detalle={`${actual.cumplidos} de ${actual.dias} · antes ${anterior.cumplidos} de ${anterior.dias}`} />
          <Comparacion titulo="Calorías vs meta" ahora={actual.caloriasPct} antes={anterior.caloriasPct} objetivo={100}
            detalle="Promedio de los días registrados" />
          <Comparacion titulo="Proteína vs meta" ahora={actual.proteinaPct} antes={anterior.proteinaPct} objetivo={100}
            detalle="Promedio de los días registrados" />
        </div>
      </section>

      {/* Barras por semana */}
      <section className="tarjeta">
        <h2 className="font-semibold">Días por semana</h2>
        <p className="mb-2 text-xs text-suave">Últimas 8 semanas, de lunes a domingo</p>
        <Leyenda />
        {hayDatos ? <BarrasSemanas semanas={semanas} /> : <Vacio>Cuando registres comidas, aquí verás tu constancia semana a semana.</Vacio>}
      </section>

      {/* Calendario */}
      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Calendario</h2>
        <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1.5">
          <span />
          {DIAS_SEMANA.map((d, i) => <span key={i} className="text-center text-[11px] text-suave">{d}</span>)}
          {semanas.map((s) => (
            <div key={s.lunes} className="contents">
              <span className="pr-1 text-right text-[11px] text-suave tabular-nums">{fechaCorta(s.lunes)}</span>
              {s.estados.map((e, i) => {
                const f = sumarDias(s.lunes, i)
                const d = porFecha.get(f)
                const extra = d ? ` · ${fmt(d.calorias)} kcal, ${fmt(d.proteina_g)} g proteína` : ''
                return <CeldaDia key={f} estado={estados.get(f) ?? e} hoy={f === hoy} futuro={f > hoy}
                  etiqueta={`${NOMBRE_DIA.format(new Date(`${f}T12:00:00Z`))}: ${TEXTO_ESTADO[e]}${extra}`} />
              })}
            </div>
          ))}
        </div>
        <div className="mt-3"><Leyenda conVacio /></div>
      </section>

      {/* Tabla (también es la vista accesible de los gráficos) */}
      <section className="tarjeta overflow-x-auto">
        <h2 className="mb-2 font-semibold">Detalle por semana</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 font-normal">Semana</th>
              <th className="text-right font-normal">Registr.</th>
              <th className="text-right font-normal">Cumpl.</th>
              <th className="text-right font-normal">Kcal</th>
              <th className="text-right font-normal">Prot.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {[...semanas].reverse().map((s) => (
              <tr key={s.lunes}>
                <td className="py-1.5">{fechaCorta(s.lunes)}</td>
                <td className="text-right tabular-nums">{s.registrados}/{s.dias}</td>
                <td className="text-right tabular-nums">{s.cumplidos}/{s.dias}</td>
                <td className="text-right tabular-nums">{s.caloriasPct === null ? '—' : `${s.caloriasPct} %`}</td>
                <td className="text-right tabular-nums">{s.proteinaPct === null ? '—' : `${s.proteinaPct} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-suave">
          Registrado: {TEXTO_REGLAS.registrado}. Cumplido: {TEXTO_REGLAS.cumplido}.
        </p>
      </section>

      {/* Peso */}
      <section className="tarjeta">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Peso</h2>
          <Link href="/registrar?tipo=peso" className="text-sm font-medium text-acento">+ Nuevo peso</Link>
        </div>
        {pesos.length >= 2 ? <GraficoPeso pesos={pesos} /> : <Vacio>Registra tu peso al menos dos días para ver la evolución.</Vacio>}
      </section>

      {/* Días */}
      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Últimos 30 días</h2>
        {dias.length === 0 ? <Vacio>Aún no hay registros.</Vacio> : (
          <ul className="divide-y divide-borde">
            {dias.map((d) => {
              const e = estados.get(d.fecha) ?? 'vacio'
              const pctKcal = d.meta_calorias ? Math.min(100, (d.calorias / d.meta_calorias) * 100) : 0
              return (
                <li key={d.fecha}>
                  <Link href={`/?fecha=${d.fecha}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-14 shrink-0 text-suave">{fechaCorta(d.fecha)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-borde">
                      <span className="block h-full rounded-full bg-acento" style={{ width: `${pctKcal}%` }} />
                    </span>
                    <span className="w-16 text-right tabular-nums">{fmt(d.calorias)}</span>
                    <span className="w-5 text-center text-xs" title={TEXTO_ESTADO[e]} aria-label={TEXTO_ESTADO[e]}>
                      {e === 'cumplido' ? <b className="text-racha-cumplido">✓</b> : e === 'registrado' ? <b className="text-racha-registro">•</b> : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function GraficoPeso({ pesos }: { pesos: { fecha: string; kg: number }[] }) {
  const W = 320, H = 140, M = { l: 34, r: 8, t: 10, b: 20 }
  const t0 = Date.parse(pesos[0].fecha), t1 = Date.parse(pesos.at(-1)!.fecha)
  const min = Math.floor(Math.min(...pesos.map((p) => p.kg)) - 0.5)
  const max = Math.ceil(Math.max(...pesos.map((p) => p.kg)) + 0.5)
  const x = (f: string) => M.l + ((Date.parse(f) - t0) / Math.max(1, t1 - t0)) * (W - M.l - M.r)
  const y = (kg: number) => M.t + (1 - (kg - min) / (max - min)) * (H - M.t - M.b)
  const linea = pesos.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')
  const ultimo = pesos.at(-1)!
  const cambio = ultimo.kg - pesos[0].kg
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Peso de ${pesos[0].kg} a ${ultimo.kg} kg`}>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--borde)" />
            <text x={M.l - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--suave)">{fmt(v, 1)}</text>
          </g>
        ))}
        <path d={linea} fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinejoin="round" />
        {pesos.map((p) => <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.kg)} r="4" fill="var(--acento)" stroke="var(--superficie)" strokeWidth="2"><title>{`${fechaCorta(p.fecha)}: ${p.kg} kg`}</title></circle>)}
        <text x={M.l} y={H - 4} fontSize="9" fill="var(--suave)">{fechaCorta(pesos[0].fecha)}</text>
        <text x={W - M.r} y={H - 4} fontSize="9" fill="var(--suave)" textAnchor="end">{fechaCorta(ultimo.fecha)}</text>
      </svg>
      <figcaption className="mt-1 text-sm">
        Ahora <b>{fmt(ultimo.kg, 1)} kg</b>
        <span className="text-suave"> · {cambio >= 0 ? '+' : ''}{fmt(cambio, 1)} kg desde el {fechaCorta(pesos[0].fecha)}</span>
      </figcaption>
    </figure>
  )
}
