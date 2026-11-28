'use client'

import { createBrowserClient } from '@supabase/ssr'

/** Cliente de Supabase en el navegador, con la sesión del usuario (RLS). */
export function clienteNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
}
