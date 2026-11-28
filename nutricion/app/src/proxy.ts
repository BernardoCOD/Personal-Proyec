import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { rutaSegura } from './lib/volver'

// Rutas que se pueden abrir sin iniciar sesión.
// /api/mcp y /.well-known/ son del conector de Claude: tienen su propia autenticación (OAuth).
const PUBLICAS = ['/login', '/auth/', '/api/mcp', '/.well-known/']

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
    // Después de iniciar sesión se vuelve aquí (p. ej., a la pantalla de permiso de Claude).
    if (ruta !== '/') destino.searchParams.set('volver', ruta + request.nextUrl.search)
    return copiarCookies(respuesta, NextResponse.redirect(destino))
  }
  if (conSesion && ruta === '/login') {
    const volver = rutaSegura(request.nextUrl.searchParams.get('volver'))
    const destino = new URL(volver ?? '/', request.url)
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
