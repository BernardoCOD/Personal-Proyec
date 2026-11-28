import { Llama } from './racha'
import { fechaCorta } from '@/lib/fechas'
import type { Semana } from '@/lib/racha'

// Piezas visuales del panel de progreso (sin datos: se pueden previsualizar).

export function pct(n: number, de: number) {
  return de > 0 ? Math.round((n / de) * 100) : null
}

export function TarjetaRacha({ tipo, titulo, racha, ayuda }: { tipo: 'registro' | 'cumplimiento'; titulo: string; racha: { actual: number; mejor: number }; ayuda: string }) {
  return (
    <div className="tarjeta">
      <div className="flex items-center gap-2">
        <Llama tipo={tipo} apagada={racha.actual === 0} className="h-9 w-9 shrink-0" />
        <div>
          <p className="text-3xl font-bold leading-none tabular-nums">{racha.actual}</p>
          <p className="text-xs text-suave">{racha.actual === 1 ? 'día' : 'días'} seguidos</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium">{titulo}</p>
      <p className="text-xs text-suave">Mejor: {racha.mejor} · {ayuda}</p>
    </div>
  )
}

/** Valor de esta semana con su cambio frente a la anterior (en puntos). */
export function Comparacion({ titulo, ahora, antes, detalle, objetivo }: { titulo: string; ahora: number | null; antes: number | null; detalle: string; objetivo?: number }) {
  const cambio = ahora !== null && antes !== null ? ahora - antes : null
  // Con una meta (100 %), "mejor" es acercarse a ella; si no, subir.
  const mejora = cambio === null ? null : objetivo ? Math.abs(ahora! - objetivo) < Math.abs(antes! - objetivo) : cambio > 0
  return (
    <div className="rounded-xl bg-fondo p-3">
      <p className="text-xs text-suave">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums">{ahora === null ? '—' : `${ahora} %`}</p>
      <p className="text-xs text-suave">
        {cambio === null || cambio === 0 ? 'Igual que la semana anterior' : (
          <><span aria-hidden>{cambio > 0 ? '▲' : '▼'}</span> {Math.abs(cambio)} pts {mejora ? '(mejor)' : '(peor)'}</>
        )}
      </p>
      <p className="mt-0.5 text-[11px] text-suave">{detalle}</p>
    </div>
  )
}

export function Leyenda({ conVacio = false }: { conVacio?: boolean }) {
  const item = (clase: string, simbolo: string, texto: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] text-[9px] font-bold leading-none ${clase}`} aria-hidden>{simbolo}</span>
      {texto}
    </span>
  )
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
      {item('bg-racha-cumplido text-white', '✓', 'Cumplido')}
      {item('bg-racha-registro text-white', '•', 'Solo registrado')}
      {conVacio && item('bg-borde', '', 'Sin registrar')}
    </div>
  )
}

/** Barras apiladas: días cumplidos (abajo) + solo registrados, sobre 7. */
export function BarrasSemanas({ semanas }: { semanas: Semana[] }) {
  const W = 320, H = 150, M = { l: 22, r: 4, t: 14, b: 20 }
  const ancho = (W - M.l - M.r) / semanas.length
  const barra = Math.min(22, ancho - 10)
  const y = (dias: number) => M.t + (1 - dias / 7) * (H - M.t - M.b)
  const base = y(0)
  const ultima = semanas.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label="Días cumplidos y registrados por semana en las últimas 8 semanas. El detalle está en la tabla de abajo.">
      {[0, 7].map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--borde)" />
          <text x={M.l - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--suave)">{v}</text>
        </g>
      ))}
      {semanas.map((s, i) => {
        const x = M.l + i * ancho + (ancho - barra) / 2
        const soloRegistrados = s.registrados - s.cumplidos
        const yC = y(s.cumplidos), yR = y(s.registrados)
        const gap = s.cumplidos > 0 && soloRegistrados > 0 ? 2 : 0
        return (
          <g key={s.lunes} className="[&:hover_rect]:opacity-80">
            <title>{`Semana del ${fechaCorta(s.lunes)}: ${s.cumplidos} cumplidos, ${s.registrados} registrados de ${s.dias} días`}</title>
            {/* zona sensible más grande que la barra */}
            <rect x={M.l + i * ancho} y={M.t} width={ancho} height={base - M.t} fill="transparent" />
            {s.cumplidos > 0 && <BarraRedondeada x={x} y={yC} w={barra} h={base - yC} color="var(--racha-cumplido)" arriba={soloRegistrados === 0} />}
            {soloRegistrados > 0 && <BarraRedondeada x={x} y={yR} w={barra} h={yC - yR - gap} color="var(--racha-registro)" arriba />}
            <text x={x + barra / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--suave)">{fechaCorta(s.lunes)}</text>
            {i === ultima && s.registrados > 0 && (
              <text x={x + barra / 2} y={yR - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--texto)">{s.registrados}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Rectángulo con esquinas de 4 px solo arriba (el extremo de datos). */
function BarraRedondeada({ x, y, w, h, color, arriba }: { x: number; y: number; w: number; h: number; color: string; arriba: boolean }) {
  if (h <= 0) return null
  const r = arriba ? Math.min(4, h, w / 2) : 0
  return <path fill={color} d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`} />
}

