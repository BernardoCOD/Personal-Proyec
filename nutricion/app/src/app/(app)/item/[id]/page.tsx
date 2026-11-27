import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { NOMBRE_COMIDA } from '@/componentes/ui'
import { datosRegistrados } from '@/lib/datos'
import { fechaEnZona, fechaLarga, horaEnZona } from '@/lib/fechas'
import { FormEditarItem } from './formulario'

export const metadata: Metadata = { title: 'Editar alimento' }

export default function PaginaItem({ params }: PageProps<'/item/[id]'>) {
  return (
    <Suspense fallback={<p className="text-suave">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  )
}

async function Contenido({ params }: { params: PageProps<'/item/[id]'>['params'] }) {
  const [{ id }, { supabase, zona }] = await Promise.all([params, datosRegistrados()])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data: item } = await supabase.from('comida_items')
    .select('id, alimento_id, nombre_alimento, cantidad, unidad, gramos, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, comidas(tipo, fecha_hora)')
    .eq('id', id).maybeSingle()
  if (!item) notFound()

  const alimento = item.alimento_id
    ? (await supabase.from('alimentos')
        .select('calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, porciones(nombre, gramos)')
        .eq('id', item.alimento_id).maybeSingle()).data
    : null
  const comida = item.comidas as unknown as { tipo: string; fecha_hora: string }
  const fecha = fechaEnZona(new Date(comida.fecha_hora), zona)

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/?fecha=${fecha}`} className="text-sm text-acento">‹ Volver</Link>
        <h1 className="mt-1 text-xl font-bold">{item.nombre_alimento}</h1>
        <p className="text-sm text-suave first-letter:uppercase">
          {NOMBRE_COMIDA[comida.tipo] ?? comida.tipo} · {fechaLarga(fecha)}, {horaEnZona(comida.fecha_hora, zona)}
        </p>
      </div>
      <FormEditarItem
        id={item.id}
        volver={`/?fecha=${fecha}`}
        cantidad={Number(item.cantidad)}
        unidad={item.unidad}
        actual={{
          gramos: Number(item.gramos), calorias: Number(item.calorias), proteina_g: Number(item.proteina_g),
          carbohidratos_g: Number(item.carbohidratos_g), grasa_g: Number(item.grasa_g), fibra_g: Number(item.fibra_g),
        }}
        catalogo={alimento ? {
          calorias: Number(alimento.calorias), proteina_g: Number(alimento.proteina_g), carbohidratos_g: Number(alimento.carbohidratos_g),
          grasa_g: Number(alimento.grasa_g), fibra_g: Number(alimento.fibra_g),
          porciones: ((alimento.porciones ?? []) as { nombre: string; gramos: number }[]).map((p) => ({ nombre: p.nombre, gramos: Number(p.gramos) })),
        } : null}
      />
    </div>
  )
}
