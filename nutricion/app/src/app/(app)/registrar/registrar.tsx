'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { caloriasActividad, type Intensidad } from '@/lib/calculos'
import { desfaseZona } from '@/lib/fechas'
import { aGramos, esUnidadFija, macrosDeGramos, UNIDADES_FIJAS } from '@/lib/unidades'
import { cantidadInicial, interpretarBusqueda } from '@/lib/busqueda'
import { fmt } from '@/componentes/ui'
import {
  buscarAlimentos,
  registrarActividad,
  registrarComida,
  registrarPeso,
  type AlimentoBuscado,
  type EstadoRegistro,
} from '../acciones'

type Pestana = 'comida' | 'actividad' | 'peso'

type Props = {
  pestanaInicial: Pestana
  /** Sección desde la que se llegó (desayuno, almuerzo...); vacío = según la hora. */
  tipoComida: string
  fecha: string
  hoy: string
  zona: string
  /** 'AAAA-MM-DDTHH:mm' inicial en la zona del usuario (lo calcula el servidor). */
  fechaHora: string
  pesoKg: number
  recientes: AlimentoBuscado[]
}

export function Registrar(p: Props) {
  const [pestana, setPestana] = useState<Pestana>(p.pestanaInicial)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-borde bg-superficie p-1 text-sm" role="tablist">
        {(['comida', 'actividad', 'peso'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={pestana === t} onClick={() => setPestana(t)}
            className={`rounded-lg py-2 font-medium ${pestana === t ? 'bg-acento text-white' : 'text-suave'}`}>
            {t === 'comida' ? 'Comida' : t === 'actividad' ? 'Actividad' : 'Peso'}
          </button>
        ))}
      </div>
      {pestana === 'comida' && <FormComida {...p} />}
      {pestana === 'actividad' && <FormActividad {...p} />}
      {pestana === 'peso' && <FormPeso {...p} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fecha y hora en la zona del usuario
// ---------------------------------------------------------------------
/** 'AAAA-MM-DDTHH:mm' en la zona → ISO con desfase. */
function aIso(local: string, zona: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return ''
  return `${local}:00${desfaseZona(new Date(`${local.slice(0, 10)}T12:00:00Z`), zona)}`
}
function tipoPorHora(local: string) {
  const h = Number(local.slice(11, 13))
  if (h >= 5 && h < 11) return 'desayuno'
  if (h >= 11 && h < 16) return 'almuerzo'
  if (h >= 19 || h < 2) return 'cena'
  return 'snack'
}

// ---------------------------------------------------------------------
// Comida
// ---------------------------------------------------------------------
type ItemCatalogo = { clave: number; tipo: 'catalogo'; alimento: AlimentoBuscado; cantidad: string; unidad: string }
type ItemManual = {
  clave: number; tipo: 'manual'; nombre: string; cantidad: string; unidad: string; gramos: string
  calorias: string; proteina_g: string; carbohidratos_g: string; grasa_g: string; guardar: boolean
}
type ItemUI = ItemCatalogo | ItemManual

let siguienteClave = 1

function macrosItem(i: ItemUI) {
  if (i.tipo === 'catalogo') {
    const g = aGramos(Number(i.cantidad), i.unidad, i.alimento.porciones)
    return g === null ? null : { gramos: g, ...macrosDeGramos(i.alimento, g) }
  }
  const n = (s: string) => Number(s) || 0
  return { gramos: n(i.gramos), calorias: n(i.calorias), proteina_g: n(i.proteina_g), carbohidratos_g: n(i.carbohidratos_g), grasa_g: n(i.grasa_g), fibra_g: 0 }
}

function FormComida({ fechaHora: inicial, hoy, zona, recientes, tipoComida }: Props) {
  const [fechaHora, setFechaHora] = useState(inicial)
  const [tipo, setTipo] = useState<string>(tipoComida)
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemUI[]>([])
  const [estado, accion, guardando] = useActionState(registrarComida, {} as EstadoRegistro)
  const tipoEfectivo = tipo || (fechaHora ? tipoPorHora(fechaHora) : 'almuerzo')

  const agregar = (a: AlimentoBuscado, cantidad: number, unidad: string) =>
    setItems((xs) => [...xs, { clave: siguienteClave++, tipo: 'catalogo', alimento: a, cantidad: String(cantidad), unidad }])
  const agregarManual = (nombre = '', cantidad: number | null = null, unidad: string | null = null) => {
    const gramos = unidad && esUnidadFija(unidad) && cantidad ? String(aGramos(cantidad, unidad)) : ''
    setItems((xs) => [...xs, {
      clave: siguienteClave++, tipo: 'manual', nombre, cantidad: String(cantidad ?? 1), unidad: unidad ?? 'porción', gramos,
      calorias: '', proteina_g: '', carbohidratos_g: '', grasa_g: '', guardar: true,
    }])
  }
  const enLaComida = new Set(items.flatMap((i) => (i.tipo === 'catalogo' ? [i.alimento.id] : [])))
  const actualizar = (clave: number, cambios: Partial<ItemCatalogo> | Partial<ItemManual>) =>
    setItems((xs) => xs.map((x) => (x.clave === clave ? ({ ...x, ...cambios } as ItemUI) : x)))
  const quitar = (clave: number) => setItems((xs) => xs.filter((x) => x.clave !== clave))

  const calculados = items.map(macrosItem)
  const total = calculados.reduce(
    (t, m) => (m ? { kcal: t.kcal + m.calorias, p: t.p + m.proteina_g, c: t.c + m.carbohidratos_g, g: t.g + m.grasa_g } : t),
    { kcal: 0, p: 0, c: 0, g: 0 },
  )
  const validos = items.length > 0 && calculados.every((m, idx) => m && m.gramos > 0 && (items[idx].tipo === 'catalogo' || (items[idx] as ItemManual).nombre.trim()))

  const datos = JSON.stringify({
    tipo: tipoEfectivo,
    fecha_hora: aIso(fechaHora, zona),
    notas,
    items: items.map((i) =>
      i.tipo === 'catalogo'
        ? { alimento_id: i.alimento.id, cantidad: Number(i.cantidad), unidad: i.unidad }
        : { nombre: i.nombre, cantidad: Number(i.cantidad) || 1, unidad: i.unidad || 'porción', gramos: Number(i.gramos),
            calorias: Number(i.calorias) || 0, proteina_g: Number(i.proteina_g) || 0, carbohidratos_g: Number(i.carbohidratos_g) || 0,
            grasa_g: Number(i.grasa_g) || 0, guardar: i.guardar },
    ),
  })

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="datos" value={datos} />
      <section className="tarjeta space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {(['desayuno', 'almuerzo', 'cena', 'snack'] as const).map((t) => (
            <button key={t} type="button" className="chip px-1 capitalize" data-activo={tipoEfectivo === t} onClick={() => setTipo(t)}>{t}</button>
          ))}
        </div>
        <div>
          <label className="etiqueta" htmlFor="fh-comida">Fecha y hora</label>
          <input id="fh-comida" type="datetime-local" className="campo" required value={fechaHora} max={`${hoy}T23:59`}
            onChange={(e) => setFechaHora(e.target.value)} />
        </div>
      </section>

      <Buscador onAgregar={agregar} onManual={agregarManual} recientes={recientes} enLaComida={enLaComida}
        nombreComida={NOMBRES_COMIDA[tipoEfectivo] ?? tipoEfectivo} />

      <button type="button" className="boton-secundario w-full text-sm" onClick={() => agregarManual()}>
        + Alimento que no está en la lista
      </button>

      {items.length > 0 && (
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">En esta comida</h2>
          {items.map((i, idx) => (
            <div key={i.clave} className="rounded-xl border border-borde p-3">
              {i.tipo === 'catalogo' ? (
                <FilaCatalogo item={i} m={calculados[idx]} onCambio={(c) => actualizar(i.clave, c)} onQuitar={() => quitar(i.clave)} />
              ) : (
                <FilaManual item={i} onCambio={(c) => actualizar(i.clave, c)} onQuitar={() => quitar(i.clave)} />
              )}
            </div>
          ))}
          <div className="flex justify-between border-t border-borde pt-2 text-sm font-medium">
            <span>Total</span>
            <span>{fmt(total.kcal)} kcal · P {fmt(total.p)} · C {fmt(total.c)} · G {fmt(total.g)}</span>
          </div>
        </section>
      )}

      <div>
        <label className="etiqueta" htmlFor="notas">Notas (opcional)</label>
        <input id="notas" className="campo" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      <button className="boton w-full" disabled={guardando || !validos || !fechaHora}>{guardando ? 'Guardando…' : 'Guardar comida'}</button>
    </form>
  )
}

/** "al desayuno", "a la cena"... para los textos de agregar. */
const NOMBRES_COMIDA: Record<string, string> = { desayuno: 'al desayuno', almuerzo: 'al almuerzo', cena: 'a la cena', snack: 'a los snacks' }

function Buscador({ onAgregar, onManual, recientes, enLaComida, nombreComida }: {
  onAgregar: (a: AlimentoBuscado, cantidad: number, unidad: string) => void
  onManual: (nombre: string, cantidad: number | null, unidad: string | null) => void
  recientes: AlimentoBuscado[]
  enLaComida: Set<string>
  nombreComida: string
}) {
  const [q, setQ] = useState('')
  const [encontrados, setEncontrados] = useState<{ texto: string; lista: AlimentoBuscado[] } | null>(null)
  const [buscando, iniciar] = useTransition()
  const [abierto, setAbierto] = useState<{ id: string; cantidad: string; unidad: string } | null>(null)
  const [aviso, setAviso] = useState('')

  // "plátano frito 100g" -> buscar "plátano frito", con 100 g ya puestos.
  const interpretado = interpretarBusqueda(q)
  const texto = interpretado.texto.trim()

  useEffect(() => {
    if (texto.length < 2) return
    const t = setTimeout(() => iniciar(async () => {
      const lista = await buscarAlimentos(texto)
      setEncontrados({ texto, lista })
    }), 250)
    return () => clearTimeout(t)
  }, [texto])

  // Solo se muestran los resultados de lo que está escrito ahora.
  const resultados = texto.length >= 2 && encontrados?.texto === texto ? encontrados.lista : null
  const lista = resultados ?? (texto.length >= 2 ? [] : recientes)

  const confirmar = (a: AlimentoBuscado, cantidad: number, unidad: string) => {
    onAgregar(a, cantidad, unidad)
    setAviso(`✓ ${a.nombre} agregado ${nombreComida}`)
    setAbierto(null)
    setQ('')
  }
  const abrir = (a: AlimentoBuscado) => {
    if (abierto?.id === a.id) return setAbierto(null)
    const ini = cantidadInicial(interpretado, a.porciones)
    setAbierto({ id: a.id, cantidad: String(ini.cantidad), unidad: ini.unidad })
  }

  return (
    <section className="tarjeta space-y-2">
      <label className="etiqueta" htmlFor="buscar">Buscar alimento</label>
      <input id="buscar" type="search" className="campo" placeholder="Ej.: arroz, 2 panes, plátano frito 100 g" value={q} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setAviso(''); setAbierto(null) }} />
      {aviso && <p role="status" className="rounded-lg bg-acento-suave px-3 py-2 text-sm text-acento">{aviso}</p>}
      {(interpretado.cantidad !== null || interpretado.unidad) && texto.length >= 2 && (
        <p className="text-xs text-suave">
          Cantidad detectada: <b className="text-texto">{interpretado.cantidad ?? 1} {interpretado.unidad ?? (interpretado.cantidad !== null && interpretado.cantidad >= 20 ? 'g' : 'porción')}</b>. Toca un alimento para cambiarla.
        </p>
      )}
      {texto.length < 2 && recientes.length > 0 && <p className="text-xs text-suave">Usados recientemente</p>}
      {buscando && <p className="text-xs text-suave">Buscando…</p>}
      {resultados !== null && !buscando && resultados.length === 0 && (
        <div className="rounded-xl border border-dashed border-borde p-3 text-sm">
          <p className="text-suave">No encontré “{texto}”.</p>
          <button type="button" className="mt-2 font-medium text-acento"
            onClick={() => { onManual(texto, interpretado.cantidad, interpretado.unidad); setQ('') }}>
            + Agregar “{texto}” a mano
          </button>
        </div>
      )}
      {lista.length > 0 && (
        <ul className="max-h-[26rem] divide-y divide-borde overflow-y-auto">
          {lista.map((a) => {
            const ini = cantidadInicial(interpretado, a.porciones)
            const esAbierto = abierto?.id === a.id
            return (
              <li key={a.id} className={esAbierto ? 'rounded-xl bg-fondo' : ''}>
                <div className="flex items-center gap-2">
                  <button type="button" className="flex min-w-0 flex-1 flex-col py-2.5 pl-1 text-left text-sm" onClick={() => abrir(a)}
                    aria-expanded={esAbierto}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{a.nombre}{a.marca && <span className="text-suave"> · {a.marca}</span>}</span>
                      <Fuente fuente={a.fuente} />
                    </span>
                    <span className="text-xs text-suave">
                      {enLaComida.has(a.id) && <b className="text-acento">✓ en la comida · </b>}
                      {fmt(a.calorias)} kcal · P {fmt(a.proteina_g, 1)} · C {fmt(a.carbohidratos_g, 1)} · G {fmt(a.grasa_g, 1)} por 100 g
                    </span>
                  </button>
                  {!esAbierto && (
                    <button type="button" onClick={() => confirmar(a, ini.cantidad, ini.unidad)}
                      aria-label={`Agregar ${ini.cantidad} ${ini.unidad} de ${a.nombre}`} title={`Agregar ${ini.cantidad} ${ini.unidad}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-acento text-xl leading-none text-white active:scale-95">+</button>
                  )}
                </div>
                {esAbierto && <AjusteCantidad alimento={a} valor={abierto} onCambio={setAbierto}
                  onAgregar={(c, u) => confirmar(a, c, u)} nombreComida={nombreComida} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Panel que se abre al tocar un resultado: cantidad, unidad y calorías antes de agregar. */
function AjusteCantidad({ alimento, valor, onCambio, onAgregar, nombreComida }: {
  alimento: AlimentoBuscado
  valor: { id: string; cantidad: string; unidad: string }
  onCambio: (v: { id: string; cantidad: string; unidad: string }) => void
  onAgregar: (cantidad: number, unidad: string) => void
  nombreComida: string
}) {
  const g = aGramos(Number(valor.cantidad), valor.unidad, alimento.porciones)
  const m = g === null ? null : macrosDeGramos(alimento, g)
  return (
    <div className="space-y-2 px-1 pb-3">
      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <input type="number" inputMode="decimal" step="any" min="0" className="campo" aria-label="Cantidad" autoFocus
          value={valor.cantidad} onChange={(e) => onCambio({ ...valor, cantidad: e.target.value })} />
        <select className="campo" aria-label="Unidad" value={valor.unidad} onChange={(e) => onCambio({ ...valor, unidad: e.target.value })}>
          {alimento.porciones.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre} ({fmt(p.gramos)} g)</option>)}
          {Object.entries(UNIDADES_FIJAS).map(([k, u]) => <option key={k} value={k}>{u.nombre}</option>)}
        </select>
      </div>
      <p className="text-xs text-suave">
        {m && g !== null
          ? <>{fmt(g)} g → <b className="text-texto">{fmt(m.calorias)} kcal</b> · P {fmt(m.proteina_g, 1)} · C {fmt(m.carbohidratos_g, 1)} · G {fmt(m.grasa_g, 1)}</>
          : 'Escribe una cantidad mayor que 0.'}
      </p>
      <button type="button" className="boton w-full py-2 text-sm" disabled={!m} onClick={() => onAgregar(Number(valor.cantidad), valor.unidad)}>
        + Agregar {nombreComida}
      </button>
    </div>
  )
}

const FUENTES: Record<string, string> = { cenan: 'CENAN', usda: 'USDA', usuario: 'Mío', receta: 'Receta', etiqueta: 'Etiqueta' }

function Fuente({ fuente }: { fuente: string }) {
  return (
    <span className="shrink-0 rounded-md border border-borde px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-suave">
      {FUENTES[fuente] ?? fuente}
    </span>
  )
}

function FilaCatalogo({ item, m, onCambio, onQuitar }: {
  item: ItemCatalogo; m: ReturnType<typeof macrosItem>; onCambio: (c: Partial<ItemCatalogo>) => void; onQuitar: () => void
}) {
  return (
    <>
      <div className="mb-2 flex items-start gap-2">
        <p className="flex-1 text-sm font-medium">{item.alimento.nombre}</p>
        <BotonQuitar onClick={onQuitar} />
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <input type="number" inputMode="decimal" step="any" min="0" className="campo" aria-label="Cantidad"
          value={item.cantidad} onChange={(e) => onCambio({ cantidad: e.target.value })} />
        <select className="campo" aria-label="Unidad" value={item.unidad} onChange={(e) => onCambio({ unidad: e.target.value })}>
          {item.alimento.porciones.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre} ({fmt(p.gramos)} g)</option>)}
          {Object.entries(UNIDADES_FIJAS).map(([k, u]) => <option key={k} value={k}>{u.nombre}</option>)}
        </select>
      </div>
      <p className="mt-2 text-xs text-suave">
        {m ? <>{fmt(m.gramos)} g → <b className="text-texto">{fmt(m.calorias)} kcal</b> · P {fmt(m.proteina_g, 1)} · C {fmt(m.carbohidratos_g, 1)} · G {fmt(m.grasa_g, 1)}</> : 'Escribe una cantidad mayor que 0.'}
      </p>
    </>
  )
}

function FilaManual({ item, onCambio, onQuitar }: { item: ItemManual; onCambio: (c: Partial<ItemManual>) => void; onQuitar: () => void }) {
  const campo = (k: keyof ItemManual, etiqueta: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="text-xs text-suave">{etiqueta}</span>
      <input className="campo py-2" value={item[k] as string} onChange={(e) => onCambio({ [k]: e.target.value })} {...props} />
    </label>
  )
  const num = { type: 'number', inputMode: 'decimal', step: 'any', min: '0' } as const
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">{campo('nombre', 'Nombre', { required: true, placeholder: 'Ej.: Lomo saltado' })}</div>
        <BotonQuitar onClick={onQuitar} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {campo('cantidad', 'Cantidad', num)}
        {campo('unidad', 'Unidad', { placeholder: 'plato' })}
        {campo('gramos', 'Gramos aprox.', { ...num, required: true })}
      </div>
      <p className="text-xs text-suave">Valores totales de esta cantidad:</p>
      <div className="grid grid-cols-4 gap-2">
        {campo('calorias', 'kcal', num)}
        {campo('proteina_g', 'Prot. g', num)}
        {campo('carbohidratos_g', 'Carb. g', num)}
        {campo('grasa_g', 'Grasa g', num)}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={item.guardar} onChange={(e) => onCambio({ guardar: e.target.checked })} className="accent-[var(--acento)]" />
        Guardar en mis alimentos para la próxima vez
      </label>
    </div>
  )
}

function BotonQuitar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Quitar" className="rounded-lg p-1.5 text-suave hover:text-peligro">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------
const SUGERENCIAS_ACTIVIDAD = ['Pesas', 'Correr', 'Caminar', 'Bicicleta', 'Natación', 'Fútbol', 'Funcional', 'Yoga', 'Elíptica', 'Baile']

function FormActividad({ fechaHora: inicial, hoy, zona, pesoKg }: Props) {
  const [fechaHora, setFechaHora] = useState(inicial)
  const [duracion, setDuracion] = useState('60')
  const [intensidad, setIntensidad] = useState<Intensidad>('moderada')
  const [kcal, setKcal] = useState<string | null>(null) // null = usar la estimación
  const [estado, accion, guardando] = useActionState(registrarActividad, {} as EstadoRegistro)
  const estimadas = Number(duracion) > 0 ? caloriasActividad(pesoKg, Number(duracion), intensidad) : 0

  return (
    <form action={accion} className="tarjeta space-y-3">
      <input type="hidden" name="fecha_hora" value={aIso(fechaHora, zona)} />
      <input type="hidden" name="intensidad" value={intensidad} />
      <div>
        <label className="etiqueta" htmlFor="tipo">Actividad</label>
        <input id="tipo" name="tipo" className="campo" list="sugerencias-actividad" required placeholder="Pesas, correr, fútbol…" />
        <datalist id="sugerencias-actividad">{SUGERENCIAS_ACTIVIDAD.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="fh-act">Fecha y hora</label>
          <input id="fh-act" type="datetime-local" className="campo" required value={fechaHora} max={`${hoy}T23:59`}
            onChange={(e) => setFechaHora(e.target.value)} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="duracion_min">Duración (min)</label>
          <input id="duracion_min" name="duracion_min" type="number" inputMode="numeric" min={1} max={1440} className="campo" required
            value={duracion} onChange={(e) => setDuracion(e.target.value)} />
        </div>
      </div>
      <div>
        <span className="etiqueta">Intensidad</span>
        <div className="grid grid-cols-3 gap-2">
          {(['baja', 'moderada', 'alta'] as const).map((n) => (
            <button key={n} type="button" className="chip capitalize" data-activo={intensidad === n} onClick={() => setIntensidad(n)}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="calorias_estimadas">Calorías quemadas (estimadas según tu peso)</label>
        <input id="calorias_estimadas" name="calorias_estimadas" type="number" inputMode="numeric" min={0} className="campo"
          value={kcal ?? String(estimadas)} onChange={(e) => setKcal(e.target.value)} />
      </div>
      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      <button className="boton w-full" disabled={guardando || !fechaHora}>{guardando ? 'Guardando…' : 'Guardar actividad'}</button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------
function FormPeso({ fecha, hoy, pesoKg }: Props) {
  const [estado, accion, guardando] = useActionState(registrarPeso, {} as EstadoRegistro)
  return (
    <form action={accion} className="tarjeta space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="fecha-peso">Fecha</label>
          <input id="fecha-peso" name="fecha" type="date" className="campo" required defaultValue={fecha} max={hoy} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="peso_kg">Peso (kg)</label>
          <input id="peso_kg" name="peso_kg" type="number" inputMode="decimal" step="0.1" min={20} max={400} className="campo" required
            defaultValue={pesoKg} />
        </div>
      </div>
      <p className="text-xs text-suave">Mejor en ayunas y a la misma hora. Si ya hay un peso ese día, se reemplaza.</p>
      {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
      <button className="boton w-full" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar peso'}</button>
    </form>
  )
}

