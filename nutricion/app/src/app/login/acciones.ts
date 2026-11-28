'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { clienteServidor } from '@/lib/supabase/servidor'
import { rutaSegura } from '@/lib/volver'

export type EstadoLogin = { error?: string; mensaje?: string; email?: string }

const esquema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
})

export async function iniciarSesion(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim()
  const datos = esquema.safeParse({ email, password: form.get('password') })
  if (!datos.success) return { error: datos.error.issues[0].message, email }

  const supabase = await clienteServidor()
  const { error } = await supabase.auth.signInWithPassword(datos.data)
  if (error) {
    const msg = error.code === 'email_not_confirmed'
      ? 'Primero confirma tu correo con el enlace que te enviamos.'
      : 'Correo o contraseña incorrectos.'
    return { error: msg, email }
  }
  redirect(rutaSegura(form.get('volver')) ?? '/')
}

export async function crearCuenta(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim()
  const nombre = String(form.get('nombre') ?? '').trim().slice(0, 80)
  const datos = esquema.safeParse({ email, password: form.get('password') })
  if (!datos.success) return { error: datos.error.issues[0].message, email }

  const h = await headers()
  const origen = h.get('origin') ?? `https://${h.get('host')}`
  const supabase = await clienteServidor()
  const { data, error } = await supabase.auth.signUp({
    ...datos.data,
    options: { data: { nombre: nombre || null }, emailRedirectTo: `${origen}/auth/confirmar` },
  })
  if (error) {
    const msg = error.code === 'user_already_exists' ? 'Ya existe una cuenta con ese correo.' : `No se pudo crear la cuenta: ${error.message}`
    return { error: msg, email }
  }
  if (!data.session) {
    return { mensaje: 'Te enviamos un correo para confirmar la cuenta. Ábrelo desde este dispositivo.', email }
  }
  redirect('/registro')
}

export async function cerrarSesion() {
  const supabase = await clienteServidor()
  await supabase.auth.signOut()
  redirect('/login')
}
