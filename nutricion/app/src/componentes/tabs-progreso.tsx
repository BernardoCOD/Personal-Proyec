import Link from 'next/link'

/** Selector de las dos vistas de Progreso. */
export function TabsProgreso({ actual }: { actual: 'resumen' | 'fotos' }) {
  const tab = (id: 'resumen' | 'fotos', href: string, texto: string) => (
    <Link href={href} aria-current={actual === id ? 'page' : undefined}
      className={`rounded-lg py-2 text-center text-sm font-medium ${actual === id ? 'bg-superficie text-texto shadow-sm' : 'text-suave'}`}>
      {texto}
    </Link>
  )
  return (
    <div className="mb-4">
      <h1 className="mb-3 text-2xl font-bold">Progreso</h1>
      <nav className="grid grid-cols-2 gap-1 rounded-xl bg-borde/60 p-1" aria-label="Vistas de progreso">
        {tab('resumen', '/historial', 'Resumen')}
        {tab('fotos', '/fotos', '📸 Fotos')}
      </nav>
    </div>
  )
}
