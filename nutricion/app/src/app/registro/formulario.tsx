'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  calcularEdad,
  calcularPlan,
  nivelSugerido,
  NIVELES_ACTIVIDAD,
  OBJETIVOS,
  type NivelActividad,
  type Sexo,
  type TipoObjetivo,
} from '@/lib/calculos'
import { esFechaValida } from '@/lib/fechas'
import { guardarRegistro, type EstadoRegistro } from './acciones'

export type ValoresRegistro = {
  nombre: string
  sexo: Sexo | ''
  fecha_nacimiento: string
  talla_cm: string
  peso_kg: string
  dias_gimnasio: number
  tipo_ejercicio: string[]
  nivel_actividad: NivelActividad | ''
  objetivo: TipoObjetivo | ''
  semanas: number
}

const TIPOS_EJERCICIO = [
  { valor: 'fuerza', nombre: 'Fuerza / pesas' },
  { valor: 'cardio', nombre: 'Cardio' },
  { valor: 'mixto', nombre: 'Mixto' },
  { valor: 'deporte', nombre: 'Deporte' },
  { valor: 'ninguno', nombre: 'Ninguno' },
]

export function FormularioRegistro({ valores, hoy, primeraVez }: { valores: ValoresRegistro; hoy: string; primeraVez: boolean }) {
  const [v, setV] = useState(valores)
  const [estado, accion, guardando] = useActionState(guardarRegistro, {} as EstadoRegistro)
  const cambiar = <K extends keyof ValoresRegistro>(k: K, valor: ValoresRegistro[K]) => setV((x) => ({ ...x, [k]: valor }))

  const talla = Number(v.talla_cm)
  const peso = Number(v.peso_kg)
  const listo = v.sexo && esFechaValida(v.fecha_nacimiento) && talla >= 100 && peso >= 30 && v.nivel_actividad && v.objetivo
  const edad = esFechaValida(v.fecha_nacimiento) ? calcularEdad(v.fecha_nacimiento, hoy) : null
  const plan = listo
    ? calcularPlan({ sexo: v.sexo as Sexo, fechaNacimiento: v.fecha_nacimiento, tallaCm: talla, pesoKg: peso,
        nivel: v.nivel_actividad as NivelActividad, objetivo: v.objetivo as TipoObjetivo }, hoy)
    : null

  return (
    <form action={accion} className="space-y-5">
      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Datos personales</h2>
        <div>
          <label className="etiqueta" htmlFor="nombre">Nombre</label>
          <input id="nombre" name="nombre" className="campo" required value={v.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
        </div>
        <div>
          <span className="etiqueta">Sexo</span>
          <div className="grid grid-cols-2 gap-2">
            {(['masculino', 'femenino'] as const).map((s) => (
              <label key={s} className="chip cursor-pointer text-center" data-activo={v.sexo === s}>
                <input type="radio" name="sexo" value={s} className="sr-only" checked={v.sexo === s} onChange={() => cambiar('sexo', s)} required />
                {s === 'masculino' ? 'Hombre' : 'Mujer'}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="etiqueta" htmlFor="fecha_nacimiento">
            Fecha de nacimiento {edad !== null && edad > 0 && <span className="font-normal">({edad} años)</span>}
          </label>
          <input id="fecha_nacimiento" name="fecha_nacimiento" type="date" className="campo" required max={hoy}
            value={v.fecha_nacimiento} onChange={(e) => cambiar('fecha_nacimiento', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiqueta" htmlFor="talla_cm">Talla (cm)</label>
            <input id="talla_cm" name="talla_cm" type="number" inputMode="decimal" step="0.1" min={100} max={250} className="campo" required
              value={v.talla_cm} onChange={(e) => cambiar('talla_cm', e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="peso_kg">Peso actual (kg)</label>
            <input id="peso_kg" name="peso_kg" type="number" inputMode="decimal" step="0.1" min={30} max={300} className="campo" required
              value={v.peso_kg} onChange={(e) => cambiar('peso_kg', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Actividad física</h2>
        <div>
          <label className="etiqueta" htmlFor="dias_gimnasio">Días de gimnasio o ejercicio por semana: <b className="text-texto">{v.dias_gimnasio}</b></label>
          <input id="dias_gimnasio" name="dias_gimnasio" type="range" min={0} max={7} className="w-full accent-[var(--acento)]"
            value={v.dias_gimnasio}
            onChange={(e) => {
              const dias = Number(e.target.value)
              setV((x) => ({ ...x, dias_gimnasio: dias, nivel_actividad: nivelSugerido(dias) }))
            }} />
        </div>
        <div>
          <span className="etiqueta">Tipo de ejercicio</span>
          <div className="flex flex-wrap gap-2">
            {TIPOS_EJERCICIO.map((t) => {
              const activo = v.tipo_ejercicio.includes(t.valor)
              return (
                <label key={t.valor} className="chip cursor-pointer" data-activo={activo}>
                  <input type="checkbox" name="tipo_ejercicio" value={t.valor} className="sr-only" checked={activo}
                    onChange={() => cambiar('tipo_ejercicio', activo ? v.tipo_ejercicio.filter((x) => x !== t.valor) : [...v.tipo_ejercicio, t.valor])} />
                  {t.nombre}
                </label>
              )
            })}
          </div>
        </div>
        <div>
          <span className="etiqueta">Nivel de actividad (incluye tu trabajo y el día a día)</span>
          <div className="space-y-2">
            {NIVELES_ACTIVIDAD.map((n) => (
              <label key={n.valor} className="chip flex cursor-pointer items-baseline justify-between gap-2 rounded-xl" data-activo={v.nivel_actividad === n.valor}>
                <input type="radio" name="nivel_actividad" value={n.valor} className="sr-only" required
                  checked={v.nivel_actividad === n.valor} onChange={() => cambiar('nivel_actividad', n.valor)} />
                <span className="font-medium text-texto">{n.nombre}</span>
                <span className="text-right text-xs">{n.detalle}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Objetivo de esta etapa</h2>
        <div className="grid grid-cols-3 gap-2">
          {OBJETIVOS.map((o) => (
            <label key={o.valor} className="chip flex cursor-pointer flex-col items-center rounded-xl py-2 text-center" data-activo={v.objetivo === o.valor}>
              <input type="radio" name="objetivo" value={o.valor} className="sr-only" required
                checked={v.objetivo === o.valor} onChange={() => cambiar('objetivo', o.valor)} />
              <span className="font-medium text-texto">{o.nombre}</span>
              <span className="text-xs">{o.detalle}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="etiqueta" htmlFor="semanas">Duración</label>
          <select id="semanas" name="semanas" className="campo" value={v.semanas} onChange={(e) => cambiar('semanas', Number(e.target.value))}>
            <option value={0}>Sin fecha de fin</option>
            {[4, 8, 12, 16, 24].map((s) => (
              <option key={s} value={s}>{s} semanas (~{Math.round(s / 4.3)} {s < 8 ? 'mes' : 'meses'})</option>
            ))}
          </select>
        </div>
      </section>

      {plan && (
        <section className="tarjeta border-acento bg-acento-suave">
          <h2 className="mb-2 font-semibold">Tu plan</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-suave">Metabolismo basal</dt><dd className="text-right font-medium">{plan.tmb} kcal</dd>
            <dt className="text-suave">Gasto diario</dt><dd className="text-right font-medium">{plan.gasto} kcal</dd>
            <dt className="text-suave">Meta diaria</dt><dd className="text-right text-lg font-bold text-acento">{plan.metas.calorias} kcal</dd>
          </dl>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div><div className="font-bold text-proteina">{plan.metas.proteinaG} g</div><div className="text-suave">Proteína</div></div>
            <div><div className="font-bold text-carbos">{plan.metas.carbohidratosG} g</div><div className="text-suave">Carbohidratos</div></div>
            <div><div className="font-bold text-grasas">{plan.metas.grasasG} g</div><div className="text-suave">Grasas</div></div>
          </div>
        </section>
      )}

      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}

      <div className="flex gap-2">
        {!primeraVez && <Link href="/perfil" className="boton-secundario flex-1">Cancelar</Link>}
        <button className="boton flex-[2]" disabled={guardando || !listo}>
          {guardando ? 'Guardando…' : primeraVez ? 'Empezar' : 'Guardar y recalcular'}
        </button>
      </div>
      <p className="text-center text-xs text-suave">Los cálculos son una guía general y no reemplazan a un nutricionista.</p>
    </form>
  )
}
