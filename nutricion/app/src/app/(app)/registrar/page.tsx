import type { Metadata } from 'next'
import { Suspense } from 'react'
import { datosRegistrados } from '@/lib/datos'
import { esFechaValida } from '@/lib/fechas'
import { alimentosRecientes } from '../acciones'
import { Registrar } from './registrar'

export const metadata: Metadata = { title: 'Registrar' }

export default function PaginaRegistrar({ searchParams }: PageProps<'/registrar'>) {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Registrar</h1>
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Contenido({ searchParams }: { searchParams: PageProps<'/registrar'>['searchParams'] }) {
  const [{ hoy, zona, ultimoPeso }, sp, recientes] = await Promise.all([datosRegistrados(), searchParams, alimentosRecientes()])
  const fecha = esFechaValida(sp.fecha) && sp.fecha <= hoy ? sp.fecha : hoy
  const pestana = sp.tipo === 'actividad' || sp.tipo === 'peso' ? sp.tipo : 'comida'
  return (
    <Registrar
      pestanaInicial={pestana}
      fecha={fecha}
      hoy={hoy}
      zona={zona}
      fechaHora={`${fecha}T${fecha === hoy ? horaEnZona24(zona) : '13:00'}`}
      pesoKg={ultimoPeso.pesoKg}
      recientes={recientes}
    />
  )
}

/** 'HH:mm' actual en la zona del usuario. */
function horaEnZona24(zona: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}
