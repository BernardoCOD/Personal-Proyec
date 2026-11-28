import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

// Metadatos OAuth del recurso (RFC 9728): indican a Claude que el servidor de
// autorización es Supabase Auth. Responde en /.well-known/oauth-protected-resource
// y en /.well-known/oauth-protected-resource/api/mcp.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const handler = protectedResourceHandler({ authServerUrls: [`${url}/auth/v1`] })
const opciones = metadataCorsOptionsRequestHandler()

export { handler as GET, opciones as OPTIONS }
