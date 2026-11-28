'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Tres pestañas: Plan (el día), Buscar (registrar alimentos) y Progreso
// (resumen, peso y fotos). El perfil se abre desde el botón del encabezado.
const ENLACES = [
  { href: '/', nombre: 'Plan', rutas: ['/', '/item'], icono: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5' },
  { href: '/registrar', nombre: 'Buscar', rutas: ['/registrar'], icono: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5' },
  { href: '/historial', nombre: 'Progreso', rutas: ['/historial', '/fotos'], icono: 'M5 20V11M12 20V5M19 20v-7' },
] as const

function activo(ruta: string, rutas: readonly string[]) {
  return rutas.some((r) => (r === '/' ? ruta === '/' : ruta === r || ruta.startsWith(`${r}/`)))
}

export function NavInferior() {
  return <Nav ruta={usePathname()} />
}

/** La misma barra sin leer la URL (mientras carga, en rutas dinámicas). */
export function Nav({ ruta }: { ruta: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mb-6 md:px-0 md:pb-0">
      <ul className="mx-auto grid max-w-sm grid-cols-3 gap-1 rounded-2xl border border-borde bg-superficie/95 p-1.5 shadow-lg shadow-black/10 backdrop-blur">
        {ENLACES.map((e) => {
          const si = activo(ruta, e.rutas)
          return (
            <li key={e.href}>
              <Link href={e.href} aria-current={si ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition ${si ? 'bg-acento-suave font-semibold text-acento' : 'text-suave'}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={si ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={e.icono} />
                </svg>
                {e.nombre}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
