import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { INSTRUCCIONES, registrarHerramientas, verificarToken } from '@/lib/mcp'

// Conector de Claude: https://<tu-app>/api/mcp (Streamable HTTP, OAuth con Supabase Auth).
const handler = createMcpHandler((server) => registrarHerramientas(server), {
  serverInfo: { name: 'nutri', version: '1.0.0' },
  instructions: INSTRUCCIONES,
})

const conAuth = withMcpAuth(handler, verificarToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

export { conAuth as GET, conAuth as POST, conAuth as DELETE }
