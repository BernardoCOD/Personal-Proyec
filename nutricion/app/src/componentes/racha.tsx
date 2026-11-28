import { TEXTO_REGLAS, type EstadoDia } from '@/lib/racha'

/** Llama de racha: amarilla = registrando, verde = cumpliendo metas. Gris si la racha está en 0. */
export function Llama({ tipo, apagada = false, className = 'h-6 w-6' }: { tipo: 'registro' | 'cumplimiento'; apagada?: boolean; className?: string }) {
  const color = apagada ? 'var(--borde)' : tipo === 'registro' ? 'var(--racha-registro)' : 'var(--racha-cumplido)'
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill={color} d="M12 2c.6 3.3-.9 5.2-2.6 7-1.6 1.7-3.4 3.6-3.4 6.6A6 6 0 0012 22a6 6 0 006-6.3c0-2.4-1.1-4.3-2.3-5.7-.3 1.6-1 2.7-2.1 3.3.6-3.9-.2-8.3-1.6-11.3z" />
      <path fill="var(--superficie)" opacity=".55" d="M12 21a3 3 0 01-3-3.1c0-1.6 1-2.6 2-3.6.2 1 .7 1.6 1.4 1.9-.1-1.2.3-2.4 1.1-3.3.9 1.2 1.5 2.5 1.5 4A3 3 0 0112 21z" />
    </svg>
  )
}

/** Chips compactos para la pantalla Hoy. */
export function ChipsRacha({ registro, cumplimiento }: { registro: number; cumplimiento: number }) {
  return (
    <div className="flex justify-center gap-2">
      <span className="flex items-center gap-1 rounded-full border border-borde bg-superficie px-2.5 py-1 text-xs"
        title={`Días seguidos registrando ${TEXTO_REGLAS.registrado}`}>
        <Llama tipo="registro" apagada={registro === 0} className="h-4 w-4" />
        <b className="tabular-nums">{registro}</b> <span className="text-suave">{registro === 1 ? 'día registrando' : 'días registrando'}</span>
      </span>
      <span className="flex items-center gap-1 rounded-full border border-borde bg-superficie px-2.5 py-1 text-xs"
        title={`Días seguidos cumpliendo: ${TEXTO_REGLAS.cumplido}`}>
        <Llama tipo="cumplimiento" apagada={cumplimiento === 0} className="h-4 w-4" />
        <b className="tabular-nums">{cumplimiento}</b> <span className="text-suave">{cumplimiento === 1 ? 'día cumpliendo' : 'días cumpliendo'}</span>
      </span>
    </div>
  )
}

export const TEXTO_ESTADO: Record<EstadoDia, string> = {
  cumplido: 'Cumplido',
  registrado: 'Registrado',
  vacio: 'Sin registrar',
}

/** Celda de calendario: color + símbolo (✓ / •), nunca solo color. */
export function CeldaDia({ estado, etiqueta, hoy = false, futuro = false }: { estado: EstadoDia; etiqueta: string; hoy?: boolean; futuro?: boolean }) {
  if (futuro) return <span className="aspect-square rounded-md" aria-hidden />
  const fondo = estado === 'cumplido' ? 'bg-racha-cumplido text-white' : estado === 'registrado' ? 'bg-racha-registro text-white' : 'bg-borde text-suave'
  return (
    <span role="img" aria-label={etiqueta} title={etiqueta}
      className={`grid aspect-square place-items-center rounded-md text-[11px] font-bold leading-none ${fondo} ${hoy ? 'ring-2 ring-texto ring-offset-1 ring-offset-superficie' : ''}`}>
      {estado === 'cumplido' ? '✓' : estado === 'registrado' ? '•' : ''}
    </span>
  )
}
