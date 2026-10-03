# Centro de Mando

Aplicación de escritorio para Windows que reúne en una sola ventana tus correos, tus apps y tu organización personal:

- **Inicio (dashboard):** tareas de hoy, correos por enviar, correos importantes por atender, hábitos del día y próximos eventos.
- **Correo con resumen:** al tocar el ícono ves tus correos clasificados por la IA (Google Gemini gratis, o Claude) en **📌 Por hacer** y **📭 Sin acción**, con la categoría (laboral, educativo, **estatal**, finanzas…), la importancia, qué tienes que hacer y el plazo.
- **Cambio de cuenta:** tus 4 Gmail y el correo de la universidad (Outlook / Microsoft 365), cada uno con su nombre (Estudios, Trabajo, Juegos…). Cada cuenta tiene su propia sesión, así que puedes tener todas abiertas a la vez.
- **Apps integradas:** Gmail, Outlook, Google Calendar, Drive, OneDrive, Notion, Canva, WhatsApp, Instagram y Facebook se abren dentro de la app.
- **Tareas y correos por enviar:** recordatorios con hora; el botón **Redactar** abre Gmail u Outlook con el destinatario y el asunto listos; marca la casilla para tacharlo.
- **Notificaciones** en Windows y en el **celular** (con la app gratuita ntfy).
- **Notion:** las tareas se sincronizan con una base de datos de Notion, para verlas y marcarlas desde el celular.
- **Hábitos:** casillas diarias y un calendario por colores (🟩 verde = todos cumplidos; lima, amarillo, naranja y rojo según cuántos falten). Incluye un resumen del mes (puntos fuertes, día más difícil, rachas) y un **cuestionario** que, con IA, analiza qué te impide ser constante.

## Instalar

1. En GitHub, entra a **Actions → Instalador de Windows**, abre la última ejecución en verde y descarga **Centro-de-Mando-instalador** (abajo, en *Artifacts*).
2. Descomprime el `.zip` y ejecuta el `.exe`.
3. Windows mostrará “Windows protegió su PC” porque la app no tiene una firma de pago: pulsa **Más información → Ejecutar de todas formas**.

Para compilarlo tú mismo: instala [Node.js 22](https://nodejs.org) y ejecuta `npm ci` y luego `npm run dist:win`. El instalador queda en `release/`.

## Primera configuración (Ajustes)

Todo se explica paso a paso dentro de **Ajustes**. En resumen:

| Qué | Para qué | Dónde se obtiene |
|---|---|---|
| Client ID y secreto de Google | Leer Gmail y Google Calendar | console.cloud.google.com (cliente “App de escritorio”) |
| Id. de aplicación de Microsoft | Leer el correo de la universidad | entra.microsoft.com (registro de aplicación) |
| API key de Gemini (gratis) o de Anthropic | Resúmenes con IA | aistudio.google.com / console.anthropic.com |
| App **ntfy** en el celular | Avisos en el celular | Play Store / App Store |
| Secreto de integración de Notion | Tareas en el celular | notion.so/profile/integrations |

Sin configurar nada ya funcionan las tareas, los hábitos y todas las apps web (en modo “solo web”, sin resúmenes).

## Límites

- **WhatsApp, Instagram y Facebook** no permiten que otras apps lean los mensajes de cuentas personales. Se abren dentro de la app y se muestra cuántos mensajes tienes sin leer, pero no un resumen.
- **Correo de la universidad:** si la universidad bloquea las apps externas (“Se necesita la aprobación del administrador”), úsalo en modo solo web o pide a soporte de TI que apruebe la app.
- Los permisos de correo y calendario son de **solo lectura**: la app nunca envía ni borra correos por su cuenta.

## Privacidad

Los datos se guardan solo en tu computadora (`%APPDATA%\Centro de Mando`). Las claves y permisos se cifran con Windows. A la IA solo se envían el remitente, el asunto y las primeras líneas de los correos nuevos. En el plan gratuito de Gemini, Google puede usar ese contenido para mejorar sus productos.

## Desarrollo

```bash
npm ci            # instalar dependencias
npm run dev       # abrir la app en modo desarrollo
npm run check     # tipos + pruebas + compilación
npm run dist:win  # generar el instalador de Windows
```

Estructura: `src/main` (proceso principal: cuentas, IA, Notion, notificaciones), `src/preload` (puente seguro), `src/renderer` (interfaz en React) y `src/shared` (lógica común con pruebas).
