'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { prepararFoto } from '@/lib/imagen'
import { BUCKET_FOTOS, VISTAS, type Vista } from '@/lib/fotos'
import { clienteNavegador } from '@/lib/supabase/navegador'
import { guardarFoto } from './acciones'

export function SubirFoto({ usuarioId, hoy, pesoKg }: { usuarioId: string; hoy: string; pesoKg: number }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('frente')
  const [fecha, setFecha] = useState(hoy)
  const [notas, setNotas] = useState('')
  const [estado, setEstado] = useState<{ cargando?: boolean; error?: string; ok?: boolean }>({})

  const elegir = (f: File | undefined) => {
    if (!f) return
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    setArchivo(f)
    setVistaPrevia(URL.createObjectURL(f))
    setEstado({})
  }
  const cancelar = () => {
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    setArchivo(null)
    setVistaPrevia(null)
    if (entrada.current) entrada.current.value = ''
  }

  const subir = async () => {
    if (!archivo) return
    setEstado({ cargando: true })
    try {
      const imagen = await prepararFoto(archivo)
      const ruta = `${usuarioId}/${crypto.randomUUID()}.jpg`
      const { error } = await clienteNavegador().storage.from(BUCKET_FOTOS).upload(ruta, imagen, { contentType: 'image/jpeg', upsert: false })
      if (error) throw new Error(`No se pudo subir: ${error.message}`)
      const r = await guardarFoto({ ruta, fecha, vista, notas })
      if (r.error) throw new Error(r.error)
      cancelar()
      setNotas('')
      setEstado({ ok: true })
      router.refresh()
    } catch (e) {
      setEstado({ error: (e as Error).message })
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => elegir(e.target.files?.[0])} />
      {!archivo ? (
        <>
          <button type="button" className="boton w-full" onClick={() => entrada.current?.click()}>📷 Tomar o elegir foto</button>
          {estado.ok && <p role="status" className="text-sm text-acento">✓ Foto guardada.</p>}
        </>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {vistaPrevia && <img src={vistaPrevia} alt="Vista previa" className="mx-auto max-h-80 rounded-xl object-contain" />}
          <div>
            <span className="etiqueta">Vista</span>
            <div className="grid grid-cols-3 gap-2">
              {VISTAS.map((v) => (
                <button key={v.valor} type="button" className="chip" data-activo={vista === v.valor} onClick={() => setVista(v.valor)}>{v.nombre}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="etiqueta">Fecha</span>
              <input type="date" className="campo" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <div>
              <span className="etiqueta">Peso</span>
              <p className="campo bg-fondo text-suave">{pesoKg} kg</p>
            </div>
          </div>
          <label className="block">
            <span className="etiqueta">Nota (opcional)</span>
            <input className="campo" maxLength={300} placeholder="Ej.: en ayunas, después de entrenar…" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>
          {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton-secundario" onClick={cancelar} disabled={estado.cargando}>Cancelar</button>
            <button type="button" className="boton" onClick={subir} disabled={estado.cargando}>{estado.cargando ? 'Subiendo…' : 'Guardar foto'}</button>
          </div>
          <p className="text-xs text-suave">Se guarda en tu almacenamiento privado, reducida y sin ubicación GPS ni otros datos ocultos.</p>
        </div>
      )}
    </div>
  )
}
