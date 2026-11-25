'use client'

import { useActionState, useState } from 'react'
import { crearCuenta, iniciarSesion, type EstadoLogin } from './acciones'

export function FormularioLogin() {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar')
  const [estadoEntrar, entrar, entrando] = useActionState(iniciarSesion, {} as EstadoLogin)
  const [estadoCrear, crear, creando] = useActionState(crearCuenta, {} as EstadoLogin)
  const estado = modo === 'entrar' ? estadoEntrar : estadoCrear
  const pendiente = entrando || creando

  return (
    <div className="tarjeta">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-fondo p-1 text-sm">
        {(['entrar', 'crear'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-lg py-2 font-medium ${modo === m ? 'bg-superficie shadow-sm' : 'text-suave'}`}
          >
            {m === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        ))}
      </div>

      <form action={modo === 'entrar' ? entrar : crear} className="space-y-3" key={modo}>
        {modo === 'crear' && (
          <div>
            <label className="etiqueta" htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" className="campo" autoComplete="given-name" />
          </div>
        )}
        <div>
          <label className="etiqueta" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required className="campo" autoComplete="email"
            defaultValue={estado.email} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required minLength={8} className="campo"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
        </div>

        {estado.error && <p role="alert" className="text-sm text-peligro">{estado.error}</p>}
        {estado.mensaje && <p role="status" className="rounded-xl bg-acento-suave p-3 text-sm text-acento">{estado.mensaje}</p>}

        <button className="boton w-full" disabled={pendiente}>
          {pendiente ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  )
}
