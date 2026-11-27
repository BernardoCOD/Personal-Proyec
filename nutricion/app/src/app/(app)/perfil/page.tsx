import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { fmt, NOMBRE_OBJETIVO } from '@/componentes/ui'
import { calcularPlan, NIVELES_ACTIVIDAD } from '@/lib/calculos'
import { datosRegistrados } from '@/lib/datos'
import { fechaCorta } from '@/lib/fechas'
import { cerrarSesion } from '../../login/acciones'

export const metadata: Metadata = { title: 'Perfil' }

export default function PaginaPerfil() {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Perfil</h1>
      <Suspense fallback={<p className="text-suave">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </>
  )
}

async function Contenido() {
  const { perfil, objetivo, ultimoPeso, email, hoy } = await datosRegistrados()
  const plan = calcularPlan({
    sexo: perfil.sexo, fechaNacimiento: perfil.fecha_nacimiento, tallaCm: Number(perfil.talla_cm),
    pesoKg: ultimoPeso.pesoKg, nivel: perfil.nivel_actividad, objetivo: objetivo.tipo,
  }, hoy)
  const nivel = NIVELES_ACTIVIDAD.find((n) => n.valor === perfil.nivel_actividad)
  // Si el peso cambió desde que se fijó la meta, avisar para recalcular.
  const desfase = Math.abs(plan.metas.calorias - objetivo.meta_calorias)

  return (
    <div className="space-y-4">
      <section className="tarjeta">
        <p className="text-lg font-semibold">{perfil.nombre}</p>
        {email && <p className="text-sm text-suave">{email}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-suave">Edad</dt><dd className="text-right">{plan.edad} años</dd>
          <dt className="text-suave">Talla</dt><dd className="text-right">{fmt(Number(perfil.talla_cm), 1)} cm</dd>
          <dt className="text-suave">Peso</dt><dd className="text-right">{fmt(ultimoPeso.pesoKg, 1)} kg <span className="text-suave">({fechaCorta(ultimoPeso.fecha)})</span></dd>
          <dt className="text-suave">Actividad</dt><dd className="text-right">{nivel?.nombre} · {perfil.dias_gimnasio ?? 0} días/sem</dd>
          <dt className="text-suave">Metabolismo basal</dt><dd className="text-right">{fmt(plan.tmb)} kcal</dd>
          <dt className="text-suave">Gasto diario</dt><dd className="text-right">{fmt(plan.gasto)} kcal</dd>
        </dl>
      </section>

      <section className="tarjeta">
        <h2 className="font-semibold">Etapa actual: {NOMBRE_OBJETIVO[objetivo.tipo]}</h2>
        <p className="text-sm text-suave">
          Desde el {fechaCorta(objetivo.fecha_inicio)}{objetivo.fecha_fin ? ` hasta el ${fechaCorta(objetivo.fecha_fin)}` : ', sin fecha de fin'}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
          <div><div className="font-bold">{fmt(objetivo.meta_calorias)}</div><div className="text-xs text-suave">kcal</div></div>
          <div><div className="font-bold text-proteina">{fmt(objetivo.meta_proteina_g)} g</div><div className="text-xs text-suave">Proteína</div></div>
          <div><div className="font-bold text-carbos">{fmt(objetivo.meta_carbohidratos_g)} g</div><div className="text-xs text-suave">Carbos</div></div>
          <div><div className="font-bold text-grasas">{fmt(objetivo.meta_grasas_g)} g</div><div className="text-xs text-suave">Grasas</div></div>
        </div>
        {objetivo.fecha_fin && objetivo.fecha_fin <= hoy && (
          <p className="mt-3 rounded-xl bg-acento-suave p-3 text-sm text-acento">Esta etapa ya terminó. Elige la siguiente en “Editar datos y objetivo”.</p>
        )}
        {desfase >= 100 && (
          <p className="mt-3 rounded-xl bg-acento-suave p-3 text-sm text-acento">
            Con tu peso actual la meta sería {fmt(plan.metas.calorias)} kcal. Puedes recalcularla en “Editar datos y objetivo”.
          </p>
        )}
      </section>

      <Link href="/registro" className="boton w-full">Editar datos y objetivo</Link>
      <form action={cerrarSesion}>
        <button className="boton-secundario w-full">Cerrar sesión</button>
      </form>
      <p className="text-center text-xs text-suave">Los cálculos son una guía general y no reemplazan a un nutricionista.</p>
    </div>
  )
}
