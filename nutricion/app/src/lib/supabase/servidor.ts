import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { configSupabase } from './config'

/** Cliente de Supabase para componentes de servidor y acciones. Usa la sesión del usuario (RLS). */
export async function clienteServidor() {
  const { url, clave } = configSupabase()
  const almacen = await cookies()
  return createServerClient(url, clave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options)
        } catch {
          // En un componente de servidor no se pueden escribir cookies;
          // el proxy ya renueva la sesión en cada petición.
        }
      },
    },
  })
}
