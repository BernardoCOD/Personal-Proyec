/** Ruta interna segura para volver después de iniciar sesión ("/oauth/consent?..."), o null. */
export function rutaSegura(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 500) return null
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null
  return v
}
