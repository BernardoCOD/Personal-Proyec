import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { clienteServidor } from '@/lib/supabase/servidor'

/** Enlace del correo de confirmación de Supabase. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const tipo = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const supabase = await clienteServidor()

  let ok = false
  if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  }

  const destino = request.nextUrl.clone()
  destino.search = ''
  destino.pathname = ok ? '/registro' : '/login'
  return NextResponse.redirect(destino)
}
