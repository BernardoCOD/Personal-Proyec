import Link from 'next/link'
import { lunesDeLaSemana, sumarDias } from '@/lib/fechas'
import type { EstadoDia } from '@/lib/racha'

const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Semana del día elegido: cada día con un punto según cómo te fue (ámbar registrado, violeta cumplido). */
export function SemanaTira({ fecha, hoy, estados }: { fecha: string; hoy: string; estados: Map<string, EstadoDia> }) {
  const lunes = lunesDeLaSemana(fecha)
  const punto: Record<EstadoDia, string> = { cumplido: 'bg-racha-cumplido', registrado: 'bg-racha-registro', vacio: 'bg-borde' }
  const texto: Record<EstadoDia, string> = { cumplido: 'cumplido', registrado: 'registrado', vacio: 'sin registrar' }
  const siguiente = sumarDias(lunes, 7)
  return (
    <nav aria-label="Días de la semana" className="flex items-center gap-1">
      <Link href={`/?fecha=${sumarDias(lunes, -7)}`} aria-label="Semana anterior" className="px-1 text-xl text-suave">‹</Link>
      <ol className="grid flex-1 grid-cols-7 gap-1">
        {LETRAS.map((l, i) => {
          const f = sumarDias(lunes, i)
          const e = estados.get(f) ?? 'vacio'
          const futuro = f > hoy
          const elegido = f === fecha
          const contenido = (
            <>
              <span className="text-[11px] text-suave">{l}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold tabular-nums ${elegido ? 'bg-acento text-sobre-acento' : f === hoy ? 'text-acento ring-2 ring-acento' : ''}`}>
                {Number(f.slice(8))}
              </span>
              <span className={`h-1.5 w-1.5 rounded-full ${futuro ? 'bg-transparent' : punto[e]}`} />
            </>
          )
          return (
            <li key={f}>
              {futuro
                ? <span className="flex flex-col items-center gap-1 opacity-40">{contenido}</span>
                : <Link href={f === hoy ? '/' : `/?fecha=${f}`} aria-current={elegido ? 'date' : undefined}
                    aria-label={`${l} ${Number(f.slice(8))}: ${texto[e]}`} className="flex flex-col items-center gap-1">{contenido}</Link>}
            </li>
          )
        })}
      </ol>
      {siguiente <= hoy
        ? <Link href={`/?fecha=${siguiente}`} aria-label="Semana siguiente" className="px-1 text-xl text-suave">›</Link>
        : <span className="px-1 text-xl text-transparent" aria-hidden>›</span>}
    </nav>
  )
}

