'use client'

import { useActionState, useState } from 'react'
import { fmt } from '@/componentes/ui'
import { aGramos, macrosDeGramos, UNIDADES_FIJAS, type Porcion, type ValoresPor100g } from '@/lib/unidades'
import { actualizarItem, eliminarItem, type EstadoRegistro } from '../../acciones'

type Valores = ValoresPor100g & { gramos: number }

export function FormEditarItem({ id, cantidad, unidad, actual, catalogo, volver }: {
  id: string
  volver: string
  cantidad: number
  unidad: string
  actual: Valores
  /** Valores por 100 g y porciones si viene del catálogo; null si se cargó a mano. */
  catalogo: (ValoresPor100g & { porciones: Porcion[] }) | null
}) {
  const [c, setC] = useState(String(cantidad))
  const [u, setU] = useState(unidad)
  const [estado, accion, guardando] = useActionState(actualizarItem, {} as EstadoRegistro)

  const n = Number(c)
  let vista: Valores | null = null
  if (n > 0) {
    if (catalogo) {
      const g = aGramos(n, u, catalogo.porciones)
      vista = g === null ? null : { gramos: g, ...macrosDeGramos(catalogo, g) }
    } else {
      const f = n / cantidad
      vista = {
        gramos: actual.gramos * f, calorias: actual.calorias * f, proteina_g: actual.proteina_g * f,
        carbohidratos_g: actual.carbohidratos_g * f, grasa_g: actual.grasa_g * f, fibra_g: actual.fibra_g * f,
      }
    }
  }
  const unidades = catalogo
    ? [...catalogo.porciones.map((p) => ({ valor: p.nombre, nombre: `${p.nombre} (${fmt(p.gramos)} g)` })),
       ...Object.entries(UNIDADES_FIJAS).map(([k, x]) => ({ valor: k, nombre: x.nombre }))]
    : null
  // Si la unidad guardada ya no existe en la lista, se muestra igual para no perderla.
  if (unidades && !unidades.some((x) => x.valor === u)) unidades.unshift({ valor: u, nombre: u })

  return (
    <div className="space-y-4">
      <form action={accion} className="tarjeta space-y-3">
        <input type="hidden" name="id" value={id} />
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <div>
            <label className="etiqueta" htmlFor="cantidad">Cantidad</label>
            <input id="cantidad" name="cantidad" type="number" inputMode="decimal" step="any" min="0" className="campo" required
              value={c} onChange={(e) => setC(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="etiqueta" htmlFor="unidad">Unidad</label>
            {unidades ? (
              <select id="unidad" name="unidad" className="campo" value={u} onChange={(e) => setU(e.target.value)}>
                {unidades.map((x) => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
              </select>
            ) : (
              <>
                <input id="unidad" className="campo" value={u} disabled />
                <input type="hidden" name="unidad" value={u} />
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-fondo p-3 text-sm">
          {vista ? (
            <>
              <p><b className="text-lg">{fmt(vista.calorias)} kcal</b> <span className="text-suave">· {fmt(vista.gramos)} g</span></p>
              <p className="mt-1 flex gap-3 text-xs text-suave">
                <span><b className="text-proteina">P</b> {fmt(vista.proteina_g, 1)} g</span>
                <span><b className="text-carbos">C</b> {fmt(vista.carbohidratos_g, 1)} g</span>
                <span><b className="text-grasas">G</b> {fmt(vista.grasa_g, 1)} g</span>
              </p>
              <p className="mt-1 text-xs text-suave">Antes: {fmt(actual.calorias)} kcal · {fmt(actual.gramos)} g</p>
            </>
          ) : <p className="text-suave">Escribe una cantidad mayor que 0.</p>}
        </div>

        {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
        <button className="boton w-full" disabled={guardando || !vista}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </form>

      <form action={eliminarItem}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="volver" value={volver} />
        <button className="boton-secundario w-full text-peligro">Quitar este alimento</button>
      </form>
    </div>
  )
}
