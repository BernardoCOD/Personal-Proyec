// Piezas de interfaz sin estado, usables desde el servidor.

export function BarraMacro({ nombre, valor, meta, color, unidad = 'g' }: {
  nombre: string
  valor: number
  meta: number
  color: string
  unidad?: string
}) {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0
  const pasado = valor > meta * 1.05
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{nombre}</span>
        <span className={pasado ? 'font-medium text-peligro' : 'text-suave'}>
          {Math.round(valor)} / {Math.round(meta)} {unidad}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-borde" role="progressbar" aria-label={nombre}
        aria-valuenow={Math.round(valor)} aria-valuemin={0} aria-valuemax={Math.round(meta)}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/** Anillo de calorías consumidas frente a la meta. */
export function AnilloCalorias({ consumidas, meta }: { consumidas: number; meta: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const pct = meta > 0 ? Math.min(1, consumidas / meta) : 0
  const restantes = Math.round(meta - consumidas)
  const pasado = restantes < 0
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--borde)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={pasado ? 'var(--peligro)' : 'var(--acento)'} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`text-2xl font-bold ${pasado ? 'text-peligro' : ''}`}>{Math.abs(restantes)}</span>
        <span className="text-xs text-suave">{pasado ? 'kcal de más' : 'kcal restantes'}</span>
      </div>
    </div>
  )
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-borde p-4 text-center text-sm text-suave">{children}</p>
}

export const NOMBRE_COMIDA: Record<string, string> = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  cena: 'Cena',
  snack: 'Snack',
}

export const NOMBRE_OBJETIVO: Record<string, string> = {
  ganar_musculo: 'Ganar músculo',
  mantener: 'Mantener',
  bajar_grasa: 'Bajar grasa',
}

export function fmt(n: number, decimales = 0) {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: decimales }).format(n)
}
