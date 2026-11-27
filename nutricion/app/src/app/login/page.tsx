import type { Metadata } from 'next'
import { FormularioLogin } from './formulario'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" width={64} height={64} className="mx-auto mb-3" />
        <h1 className="text-2xl font-bold">Nutri</h1>
        <p className="text-suave">Tu registro de comidas, macros y entrenamiento.</p>
      </div>
      <FormularioLogin />
    </main>
  )
}
