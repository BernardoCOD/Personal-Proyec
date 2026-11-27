import type { Metadata } from 'next'
import { Suspense } from 'react'
import { datosUsuario, esPerfilCompleto } from '@/lib/datos'
import { FormularioRegistro, type ValoresRegistro } from './formulario'

export const metadata: Metadata = { title: 'Mis datos' }

export default function PaginaRegistro() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-6 pb-16">
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </main>
  )
}

async function Contenido() {
  const { perfil, objetivo, ultimoPeso, hoy } = await datosUsuario()
  const primeraVez = !esPerfilCompleto(perfil) || !objetivo
  const semanas = objetivo?.fecha_fin
    ? Math.max(0, Math.round((Date.parse(objetivo.fecha_fin) - Date.parse(objetivo.fecha_inicio)) / (7 * 864e5)))
    : 0

  const valores: ValoresRegistro = {
    nombre: perfil?.nombre ?? '',
    sexo: perfil?.sexo ?? '',
    fecha_nacimiento: perfil?.fecha_nacimiento ?? '',
    talla_cm: perfil?.talla_cm?.toString() ?? '',
    peso_kg: ultimoPeso?.pesoKg.toString() ?? '',
    dias_gimnasio: perfil?.dias_gimnasio ?? 3,
    tipo_ejercicio: perfil?.tipo_ejercicio ?? [],
    nivel_actividad: perfil?.nivel_actividad ?? '',
    objetivo: objetivo?.tipo ?? '',
    semanas,
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{primeraVez ? '¡Bienvenido!' : 'Mis datos y objetivo'}</h1>
      <p className="mt-1 mb-6 text-suave">
        {primeraVez
          ? 'Con estos datos calculo tu metabolismo basal y tus metas diarias.'
          : 'Al guardar se recalculan tus metas y empieza una nueva etapa.'}
      </p>
      <FormularioRegistro valores={valores} hoy={hoy} primeraVez={primeraVez} />
    </>
  )
}
