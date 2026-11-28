'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ENLACES = [
  { href: '/', nombre: 'Hoy', icono: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { href: '/registrar', nombre: 'Registrar', icono: 'M12 5v14M5 12h14' },
  { href: '/historial', nombre: 'Progreso', icono: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { href: '/perfil', nombre: 'Perfil', icono: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0' },
] as const

export function NavInferior() {
  return <Nav ruta={usePathname()} />
}

/** La misma barra sin leer la URL (mientras carga, en rutas dinámicas). */
export function Nav({ ruta }: { ruta: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:mb-6 md:rounded-2xl md:border">
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {ENLACES.map((e) => {
          const activo = e.href === '/' ? ruta === '/' : ruta.startsWith(e.href)
          return (
            <li key={e.href}>
              <Link href={e.href} aria-current={activo ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${activo ? 'font-semibold text-acento' : 'text-suave'}`}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={activo ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
