import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { fmt, Vacio } from '@/componentes/ui'
import { datosRegistrados } from '@/lib/datos'
import { fechaCorta, lunesDeLaSemana, sumarDias } from '@/lib/fechas'

export const metadata: Metadata = { title: 'Historial' }

export default function PaginaHistorial() {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Historial</h1>
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </>
  )
}

type Dia = { fecha: string; calorias: number; proteina_g: number; carbohidratos_g: number; grasa_g: number }

async function Contenido() {
  const { supabase, objetivo, hoy } = await datosRegistrados()
  const [resumenR, pesosR] = await Promise.all([
    supabase.from('resumen_diario').select('fecha, calorias, proteina_g, carbohidratos_g, grasa_g')
      .gte('fecha', sumarDias(hoy, -55)).order('fecha', { ascending: false }),
    supabase.from('mediciones_peso').select('fecha, peso_kg').gte('fecha', sumarDias(hoy, -180)).order('fecha'),
  ])
  const dias: Dia[] = (resumenR.data ?? []).map((d) => ({
    fecha: d.fecha as string,
    calorias: Number(d.calorias),
    proteina_g: Number(d.proteina_g),
    carbohidratos_g: Number(d.carbohidratos_g),
    grasa_g: Number(d.grasa_g),
  }))
  const pesos = (pesosR.data ?? []).map((p) => ({ fecha: p.fecha as string, kg: Number(p.peso_kg) }))

  // Promedios por semana (solo días con registros).
  const semanas = new Map<string, Dia[]>()
  for (const d of dias) {
    const l = lunesDeLaSemana(d.fecha)
    semanas.set(l, [...(semanas.get(l) ?? []), d])
  }
  const promedios = [...semanas.entries()].slice(0, 8).map(([lunes, ds]) => ({
    lunes,
    dias: ds.length,
    calorias: ds.reduce((s, d) => s + d.calorias, 0) / ds.length,
    proteina: ds.reduce((s, d) => s + d.proteina_g, 0) / ds.length,
  }))

  return (
    <div className="space-y-4">
      <section className="tarjeta">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Peso</h2>
          <Link href="/registrar?tipo=peso" className="text-sm font-medium text-acento">+ Nuevo peso</Link>
        </div>
        {pesos.length >= 2 ? <GraficoPeso pesos={pesos} /> : <Vacio>Registra tu peso al menos dos días para ver la evolución.</Vacio>}
      </section>

      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Promedio por semana</h2>
        {promedios.length === 0 ? <Vacio>Aún no hay registros.</Vacio> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-suave">
              <tr><th className="py-1 font-normal">Semana del</th><th className="font-normal">Días</th><th className="text-right font-normal">kcal/día</th><th className="text-right font-normal">Prot./día</th></tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {promedios.map((s) => (
                <tr key={s.lunes}>
                  <td className="py-1.5">{fechaCorta(s.lunes)}</td>
                  <td>{s.dias}</td>
                  <td className={`text-right tabular-nums ${desvio(s.calorias, objetivo.meta_calorias)}`}>{fmt(s.calorias)}</td>
                  <td className="text-right tabular-nums">{fmt(s.proteina)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-suave">Meta actual: {fmt(objetivo.meta_calorias)} kcal y {fmt(objetivo.meta_proteina_g)} g de proteína.</p>
      </section>

      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Días anteriores</h2>
        {dias.length === 0 ? <Vacio>Aún no hay registros.</Vacio> : (
          <ul className="divide-y divide-borde">
            {dias.slice(0, 30).map((d) => {
              const pct = Math.min(100, (d.calorias / objetivo.meta_calorias) * 100)
              return (
                <li key={d.fecha}>
                  <Link href={`/?fecha=${d.fecha}`} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-14 shrink-0 text-suave">{fechaCorta(d.fecha)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-borde">
                      <span className="block h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`w-16 text-right tabular-nums ${desvio(d.calorias, objetivo.meta_calorias)}`}>{fmt(d.calorias)}</span>
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

/** Rojo si se aleja más de 15 % de la meta. */
function desvio(valor: number, meta: number) {
  return Math.abs(valor - meta) / meta > 0.15 ? 'text-peligro' : ''
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
        {pesos.map((p) => <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.kg)} r="2.5" fill="var(--acento)"><title>{`${fechaCorta(p.fecha)}: ${p.kg} kg`}</title></circle>)}
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
