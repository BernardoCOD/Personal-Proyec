import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { INSTRUCCIONES, registrarHerramientas, registrarHerramientasFotos, verificarToken } from '@/lib/mcp'

// Conector de Claude: https://<tu-app>/api/mcp (Streamable HTTP, OAuth con Supabase Auth).
const handler = createMcpHandler((server) => {
  registrarHerramientas(server)
  registrarHerramientasFotos(server)
}, {
  serverInfo: { name: 'nutri', version: '1.0.0' },
  instructions: INSTRUCCIONES,
})

const conAuth = withMcpAuth(handler, verificarToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
})

/**
 * Si alguien abre esta dirección en el navegador (sin token), se muestra una
 * página explicativa en vez del error técnico 401. Claude nunca pide HTML.
 */
function paginaNavegador(req: Request) {
  const origen = new URL(req.url).origin
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conector de Nutri para Claude</title>
<style>:root{--f:#faf7f4;--s:#fff;--t:#1d1830;--m:#6b6580;--a:#d94c18;--b:#ebe5e0}
@media(prefers-color-scheme:dark){:root{--f:#110f19;--s:#1c1a26;--t:#efedf6;--m:#a39fb5;--a:#ff7a45;--b:#2e2b3b}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--f);color:var(--t);font-family:system-ui,sans-serif;padding:16px}
main{max-width:420px;background:var(--s);border:1px solid var(--b);border-radius:16px;padding:20px}
h1{font-size:1.2rem;margin:.5rem 0}p,li{color:var(--m);line-height:1.45}code{background:var(--f);padding:2px 6px;border-radius:6px;word-break:break-all;color:var(--t)}
a.b{display:block;text-align:center;background:var(--a);color:#fff;text-decoration:none;font-weight:600;border-radius:12px;padding:10px;margin-top:14px}</style></head>
<body><main><img src="/icons/icon-192.png" width="48" height="48" alt="">
<h1>Esta dirección es para conectar Claude</h1>
<p>No es una página para abrir en el navegador: es el <b>conector</b> que Claude usa para registrar tus comidas en Nutri. Por eso aquí no se ve nada más.</p>
<p>Para conectarlo, en Claude ve a <b>Configuración → Conectores → Agregar conector personalizado</b> y pega:</p>
<p><code>${origen}/api/mcp</code></p>
<a class="b" href="/">Abrir mi app Nutri</a></main></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function GET(req: Request) {
  const esNavegador = (req.headers.get('accept') ?? '').includes('text/html') && !req.headers.get('authorization')
  return esNavegador ? paginaNavegador(req) : conAuth(req)
}

export { GET, conAuth as POST, conAuth as DELETE }
