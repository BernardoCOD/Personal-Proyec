'use client'

import { useActionState, useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { caloriasActividad, type Intensidad } from '@/lib/calculos'
import { desfaseZona } from '@/lib/fechas'
import { aGramos, esUnidadFija, macrosDeGramos, UNIDADES_FIJAS } from '@/lib/unidades'
import { cantidadInicial, interpretarBusqueda } from '@/lib/busqueda'
import { fmt } from '@/componentes/ui'
import { crearDictado, Escaner } from '@/componentes/escaner'
import type { ProductoEtiqueta } from '@/lib/open-food-facts'
import {
  buscarAlimentos,
  buscarPorCodigo,
  guardarProducto,
  type ResultadoCodigo,
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

/** Buscar alimentos (por defecto). Ejercicio y peso llegan desde Plan y Progreso. */
export function Registrar(p: Props) {
  const pestana: Pestana = p.pestanaInicial
  return (
    <div className="space-y-4">
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
  const [escaneando, setEscaneando] = useState(false)
  const [escaneo, setEscaneo] = useState<ResultadoCodigo | { tipo: 'consultando'; codigo: string } | null>(null)
  const [escuchando, setEscuchando] = useState(false)
  // El dictado solo existe en el navegador: se consulta sin romper la hidratación.
  const hayDictado = useSyncExternalStore(() => () => {}, () => crearDictado() !== null, () => false)

  const alDetectar = useCallback(async (codigo: string) => {
    setEscaneando(false)
    setEscaneo({ tipo: 'consultando', codigo })
    const r = await buscarPorCodigo(codigo)
    setEscaneo(r)
    if (r.tipo === 'mio') {
      const ini = cantidadInicial({ cantidad: null, unidad: null }, r.alimento.porciones)
      setAbierto({ id: r.alimento.id, cantidad: String(ini.cantidad), unidad: ini.unidad })
    }
  }, [])

  const dictar = () => {
    const r = crearDictado()
    if (!r) return
    r.onresult = (e) => { setQ(e.results[0][0].transcript); setAviso('') }
    r.onerror = (e) => setAviso(e.error === 'not-allowed' ? 'Activa el permiso del micrófono para dictar.' : 'No te entendí, intenta de nuevo.')
    r.onend = () => setEscuchando(false)
    setEscuchando(true)
    setEscaneo(null)
    r.start()
  }

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
    setEscaneo(null)
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
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-suave" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5" />
        </svg>
        <input id="buscar" type="search" className="campo pl-10" placeholder="Ej.: arroz, 2 panes, plátano frito 100 g" value={q} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setAviso(''); setAbierto(null); setEscaneo(null) }} />
      </div>
      <div className={`grid gap-2 ${hayDictado ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <BotonAccion onClick={() => setEscaneando(true)} texto="Escanear" icono="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />
        {hayDictado && (
          <BotonAccion onClick={dictar} activo={escuchando} texto={escuchando ? 'Escuchando' : 'Voz'} icono="M9 6a3 3 0 016 0v5a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3" />
        )}
        <BotonAccion onClick={() => { onManual(texto, interpretado.cantidad, interpretado.unidad); setQ('') }} texto="Crear" icono="M12 5v14M5 12h14" />
      </div>
      {escuchando && <p className="text-sm text-acento">🎤 Te escucho… di por ejemplo “dos panes” o “arroz cocido 150 gramos”.</p>}
      {escaneando && <Escaner onDetectado={alDetectar} onCerrar={() => setEscaneando(false)} />}
      {escaneo && (
        <ResultadoEscaneo escaneo={escaneo} abierto={abierto} setAbierto={setAbierto} nombreComida={nombreComida}
          onAgregar={confirmar} onCerrar={() => { setEscaneo(null); setAbierto(null) }}
          onGuardado={(a) => {
            setEscaneo({ tipo: 'mio', alimento: a })
            const ini = cantidadInicial({ cantidad: null, unidad: null }, a.porciones)
            setAbierto({ id: a.id, cantidad: String(ini.cantidad), unidad: ini.unidad })
          }} />
      )}
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
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-acento text-xl leading-none text-sobre-acento active:scale-95">+</button>
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

type Abierto = { id: string; cantidad: string; unidad: string } | null

/** Lo que muestra el buscador después de escanear un código. */
function ResultadoEscaneo({ escaneo, abierto, setAbierto, nombreComida, onAgregar, onGuardado, onCerrar }: {
  escaneo: ResultadoCodigo | { tipo: 'consultando'; codigo: string }
  abierto: Abierto
  setAbierto: (v: Abierto) => void
  nombreComida: string
  onAgregar: (a: AlimentoBuscado, cantidad: number, unidad: string) => void
  onGuardado: (a: AlimentoBuscado) => void
  onCerrar: () => void
}) {
  const cerrar = <button type="button" onClick={onCerrar} className="text-xs text-suave underline">Cerrar</button>
  if (escaneo.tipo === 'consultando') return <p className="rounded-xl bg-fondo p-3 text-sm text-suave">Buscando el producto {escaneo.codigo}…</p>
  if (escaneo.tipo === 'error') return <p role="alert" className="rounded-xl bg-fondo p-3 text-sm text-peligro">{escaneo.mensaje} {cerrar}</p>
  if (escaneo.tipo === 'mio') {
    const a = escaneo.alimento
    return (
      <div className="rounded-xl border border-acento bg-fondo">
        <div className="flex items-start justify-between gap-2 px-3 pt-3">
          <div>
            <p className="text-sm font-medium">{a.nombre}{a.marca && <span className="text-suave"> · {a.marca}</span>}</p>
            <p className="text-xs text-suave">{fmt(a.calorias)} kcal · P {fmt(a.proteina_g, 1)} · C {fmt(a.carbohidratos_g, 1)} · G {fmt(a.grasa_g, 1)} por 100 g</p>
          </div>
          {cerrar}
        </div>
        {abierto?.id === a.id && <div className="px-2 pt-2"><AjusteCantidad alimento={a} valor={abierto} onCambio={setAbierto}
          onAgregar={(c, u) => onAgregar(a, c, u)} nombreComida={nombreComida} /></div>}
      </div>
    )
  }
  const producto: ProductoEtiqueta = escaneo.tipo === 'nuevo' ? escaneo.producto : {
    codigo: escaneo.codigo, nombre: '', marca: null, calorias: null, proteina_g: null, carbohidratos_g: null,
    grasa_g: null, fibra_g: null, porcionGramos: null, imagen: null,
  }
  return <FichaProducto key={producto.codigo} producto={producto} encontrado={escaneo.tipo === 'nuevo'} onGuardado={onGuardado} onCerrar={onCerrar} />
}

/** Revisar o completar los datos de la etiqueta antes de guardar el producto. */
function FichaProducto({ producto, encontrado, onGuardado, onCerrar }: {
  producto: ProductoEtiqueta
  encontrado: boolean
  onGuardado: (a: AlimentoBuscado) => void
  onCerrar: () => void
}) {
  const v = (n: number | null) => (n === null ? '' : String(n))
  const [f, setF] = useState({
    nombre: producto.nombre, marca: producto.marca ?? '', calorias: v(producto.calorias), proteina_g: v(producto.proteina_g),
    carbohidratos_g: v(producto.carbohidratos_g), grasa_g: v(producto.grasa_g), fibra_g: v(producto.fibra_g ?? 0),
    porcionGramos: v(producto.porcionGramos),
  })
  const [error, setError] = useState('')
  const [guardando, iniciar] = useTransition()
  const faltan = !f.nombre.trim() || f.calorias === '' || f.proteina_g === '' || f.carbohidratos_g === '' || f.grasa_g === ''
  const campo = (k: keyof typeof f, etiqueta: string, numero = true) => (
    <label className="block">
      <span className="text-xs text-suave">{etiqueta}</span>
      <input className={`campo py-2 ${numero && f[k] === '' ? 'border-peligro' : ''}`} value={f[k]}
        {...(numero ? { type: 'number', inputMode: 'decimal' as const, step: 'any', min: '0' } : {})}
        onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  )
  const guardar = () => iniciar(async () => {
    setError('')
    const r = await guardarProducto({
      codigo: producto.codigo, nombre: f.nombre, marca: f.marca || null, calorias: f.calorias, proteina_g: f.proteina_g,
      carbohidratos_g: f.carbohidratos_g, grasa_g: f.grasa_g, fibra_g: f.fibra_g || 0, porcionGramos: f.porcionGramos || null,
    })
    if (r.error || !r.alimento) setError(r.error ?? 'No se pudo guardar.')
    else onGuardado(r.alimento)
  })

  return (
    <div className="space-y-2 rounded-xl border border-acento bg-fondo p-3">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {producto.imagen && <img src={producto.imagen} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />}
        <div className="flex-1 text-sm">
          <p className="font-medium">{encontrado ? 'Producto encontrado' : 'Producto nuevo'} <span className="font-normal text-suave">· {producto.codigo}</span></p>
          <p className="text-xs text-suave">
            {encontrado
              ? 'Datos de Open Food Facts. Revísalos con la etiqueta antes de guardar.'
              : 'No está en Open Food Facts. Copia los datos de la tabla nutricional (por 100 g).'}
          </p>
        </div>
        <button type="button" onClick={onCerrar} className="text-xs text-suave underline">Cerrar</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{campo('nombre', 'Nombre', false)}</div>
        {campo('marca', 'Marca', false)}
        {campo('porcionGramos', 'Porción (g) – opcional')}
      </div>
      <p className="pt-1 text-xs font-medium text-suave">Por cada 100 g (o 100 ml):</p>
      <div className="grid grid-cols-5 gap-1.5">
        {campo('calorias', 'kcal')}
        {campo('proteina_g', 'Prot.')}
        {campo('carbohidratos_g', 'Carb.')}
        {campo('grasa_g', 'Grasa')}
        {campo('fibra_g', 'Fibra')}
      </div>
      {error && <p role="alert" className="text-sm text-peligro">{error}</p>}
      <button type="button" className="boton w-full py-2 text-sm" disabled={faltan || guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : faltan ? 'Completa los datos en rojo' : 'Guardar producto'}
      </button>
    </div>
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

function BotonAccion({ onClick, texto, icono, activo = false }: { onClick: () => void; texto: string; icono: string; activo?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={activo}
      className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition active:scale-[0.97] ${activo ? 'animate-pulse border-acento bg-acento text-sobre-acento' : 'border-borde bg-fondo text-texto'}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icono} />
      </svg>
      {texto}
    </button>
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

