import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que se pueden abrir sin iniciar sesión.
const PUBLICAS = ['/login', '/auth/']

/**
 * Renueva la sesión de Supabase en cada petición (las cookies caducan)
 * y manda a /login a quien no la tenga.
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !clave) return respuesta // la página mostrará el error de configuración

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista, cabeceras) {
        for (const { name, value } of lista) request.cookies.set(name, value)
        respuesta = NextResponse.next({ request })
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options)
        for (const [k, v] of Object.entries(cabeceras)) respuesta.headers.set(k, v)
      },
    },
  })

  // No poner código entre createServerClient y getClaims: renueva la sesión.
  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims?.sub)
  const ruta = request.nextUrl.pathname
  const esPublica = PUBLICAS.some((p) => ruta.startsWith(p))

  if (!conSesion && !esPublica) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/login'
    destino.search = ''
    return copiarCookies(respuesta, NextResponse.redirect(destino))
  }
  if (conSesion && ruta === '/login') {
    const destino = request.nextUrl.clone()
    destino.pathname = '/'
    destino.search = ''
    return copiarCookies(respuesta, NextResponse.redirect(destino))
  }
  return respuesta
}

function copiarCookies(de: NextResponse, a: NextResponse) {
  for (const c of de.cookies.getAll()) a.cookies.set(c)
  return a
}

export const config = {
  // Todo menos archivos estáticos, iconos, manifest y service worker.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
