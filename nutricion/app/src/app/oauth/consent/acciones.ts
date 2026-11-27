'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { clienteServidor } from '@/lib/supabase/servidor'

const id = z.string().min(1).max(200)

/** Aprueba o rechaza el acceso y devuelve al usuario a la app que lo pidió (Claude). */
export async function decidir(form: FormData) {
  const authorizationId = id.parse(form.get('authorization_id'))
  const aprobar = form.get('decision') === 'aprobar'
  const supabase = await clienteServidor()
  const { data, error } = aprobar
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=1`)
  }
  redirect(data.redirect_url)
}
