# App de nutrición conectada a Claude

App personal para registrar comidas, macros, peso y actividad física. Claude registra las comidas mediante un conector MCP y la app (PWA) muestra los datos en el celular y en la PC.

Este proyecto es independiente del **Centro de Mando** que está en la raíz del repositorio.

| Fase | Estado |
|---|---|
| 1. Base de datos (Supabase) | ✅ Esquema listo: `supabase/migrations/` |
| 2. App web instalable | ✅ Lista: `app/` |
| 3. Base de alimentos (CENAN + USDA) | ✅ Lista: `datos/` y la migración de búsqueda |
| 4. Conector MCP para Claude | ✅ Listo: `app/src/app/api/mcp` |
| 5. Objetivos y recomendaciones | Pendiente |
| 6. Hacerla pública | Pendiente |

## Fase 1 – Qué se crea

| Tabla | Qué guarda |
|---|---|
| `perfiles` | Nombre, sexo, fecha de nacimiento, talla y el cuestionario de actividad (nivel, días de gimnasio, tipo de ejercicio). Se crea sola al registrarte. |
| `mediciones_peso` | Una medición de peso por día. |
| `objetivos` | Etapas (ganar músculo, mantener, bajar grasa) con sus metas de calorías y macros. Solo una puede estar activa. |
| `alimentos` | Valores por 100 g. Si `usuario_id` está vacío, el alimento pertenece al catálogo público (CENAN/USDA) y todos pueden leerlo; si no, es un alimento o receta tuya. |
| `porciones` | Equivalencias caseras: "1 taza de arroz = 160 g". |
| `comidas` | Cada desayuno, almuerzo, cena o snack, con fecha y hora. |
| `comida_items` | Cada alimento de una comida: cantidad, unidad, gramos y macros. Las macros se guardan tal como estaban al registrar, así que el historial no cambia si después se corrige un alimento. |
| `actividades` | Ejercicio: tipo, duración, intensidad y calorías estimadas. |
| `resumen_diario` (vista) | Total de calorías y macros por día, en tu zona horaria (Lima por defecto). |

**Seguridad (RLS):** todas las tablas tienen Row Level Security. Cada usuario solo ve y modifica sus propios datos; el catálogo público solo se puede leer. Sin sesión iniciada no se ve nada. Si se borra una cuenta, se borran todos sus datos.

## Fase 1 – Cómo aplicarlo en Supabase (paso a paso)

1. **Crear la cuenta y el proyecto**
   - Entra a [supabase.com](https://supabase.com) e inicia sesión con GitHub.
   - Pulsa **New project**. Ponle un nombre (por ejemplo, `nutricion`).
   - Escribe una **contraseña de base de datos** segura y guárdala en tu gestor de contraseñas.
   - En **Region** elige **South America (São Paulo)**, la más cercana a Perú.
   - Plan **Free**. Pulsa **Create new project** y espera 1 o 2 minutos.

2. **Ejecutar el esquema**
   - En el menú de la izquierda abre **SQL Editor** → **New query**.
   - Abre el archivo [`supabase/migrations/20261125000000_esquema_inicial.sql`](supabase/migrations/20261125000000_esquema_inicial.sql), copia **todo** su contenido y pégalo en el editor.
   - Pulsa **Run**. Debe aparecer *Success. No rows returned*.
   - Ejecútalo **una sola vez**. Si lo vuelves a ejecutar, mostrará errores del tipo "already exists".

3. **Comprobar que funcionó**
   - Abre **Table Editor**: deben aparecer las 8 tablas.
   - Abre **Authentication → Policies**: cada tabla debe decir **RLS enabled** y tener sus políticas.
   - Si Supabase muestra advertencias en **Advisors → Security**, revisa que no mencionen estas tablas como "RLS disabled".

4. **Configurar el inicio de sesión**
   - Abre **Authentication → Sign In / Providers** y verifica que **Email** esté activado.
   - Para empezar, puedes desactivar **Confirm email** para no tener que confirmar el correo en cada prueba. Actívalo antes de hacer pública la app.
   - En **Authentication → Users → Add user → Create new user**, crea tu usuario con tu correo y una contraseña. Marca **Auto Confirm User**.
   - Abre **Table Editor → perfiles**: debe aparecer una fila con el `id` de tu usuario. El trigger la creó sola.

5. **Guardar las claves (para las Fases 2 y 4)**
   - En **Project Settings → API** (o **API Keys**) copia:
     - **Project URL**
     - **anon / publishable key**: va en la app. Es pública, y RLS protege los datos.
     - **service_role / secret key**: es **secreta**. Solo va en las variables de entorno del servidor del conector y para cargar el catálogo de alimentos. Nunca debe ir en la app, en GitHub ni en un chat.

**Entregable de la Fase 1:** la base de datos creada y tu usuario funcionando. ✅

## Probar el esquema en local (opcional)

Las pruebas de `supabase/tests/` aplican la migración en un PostgreSQL local, con una imitación mínima del esquema `auth` de Supabase. Verifican que cada usuario solo vea sus datos, que nadie pueda modificar el catálogo, que solo haya un objetivo activo y que al borrar la cuenta se borre todo.

```bash
bash nutricion/supabase/tests/run.sh   # necesita PostgreSQL y psql
```

## Fase 2 – La app (`app/`)

App web instalable (PWA) hecha con Next.js 16, React 19 y Tailwind CSS 4.

| Pantalla | Qué hace |
|---|---|
| **Iniciar sesión / Crear cuenta** | Correo y contraseña (Supabase Auth). |
| **Registro inicial** (`/registro`) | Datos personales, cuestionario de actividad (días de gimnasio, tipo de ejercicio, nivel) y objetivo con su duración. Calcula al momento el metabolismo basal (Mifflin-St Jeor), el gasto diario y las metas de calorías y macros. Al guardar empieza una nueva etapa. |
| **Hoy** (`/`) | Calorías restantes, barras de proteína, carbohidratos y grasas, comidas ordenadas por hora, actividad y peso del día. Con las flechas pasas a otros días. Puedes borrar un alimento, una comida completa o una actividad. |
| **Registrar** (`/registrar`) | **Comida:** busca alimentos, elige la cantidad en porciones caseras, g, kg, lb, oz o ml y ve las macros al instante. Si el alimento no está en la lista, lo cargas a mano y, si quieres, lo guardas en tus alimentos. **Actividad:** con calorías estimadas por METs y tu peso. **Peso.** |
| **Historial** | Gráfico de peso, promedios por semana y los últimos 30 días frente a tu meta. |
| **Perfil** | Tus datos, metabolismo basal, gasto diario y la etapa actual. Avisa si la etapa terminó o si tu peso cambió lo suficiente como para recalcular la meta. |

Las macros siempre se calculan en el servidor a partir de la base de datos; no se confía en lo que envía el navegador. Todas las consultas usan la sesión del usuario, así que RLS se aplica siempre.

> Si un alimento no está en el catálogo, usa “Alimento que no está en la lista” y marca **Guardar en mis alimentos**: la próxima vez aparecerá primero en el buscador.

### Probarla en tu computadora

Necesitas [Node.js 22](https://nodejs.org) o una versión más reciente.

```bash
cd nutricion/app
cp .env.example .env.local     # y completa la URL y la clave publishable de Supabase
npm install
npm run dev                    # abre http://localhost:3000
```

Otros comandos: `npm test` (pruebas de los cálculos), `npm run lint`, `npm run build`.

### Publicarla en Vercel (gratis)

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New → Project** → elige este repositorio.
2. En **Root Directory** pon `nutricion/app`.
3. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Pulsa **Deploy**. Te dará una dirección como `https://nutri-xxx.vercel.app`.
5. En Supabase, en **Authentication → URL Configuration**, pon esa dirección en **Site URL** y agrega `https://nutri-xxx.vercel.app/auth/confirmar` en **Redirect URLs**. Así funciona el enlace del correo de confirmación.

### Instalarla

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar app** (o **Agregar a la pantalla principal**).
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.
- **PC (Chrome o Edge):** el ícono de instalar en la barra de direcciones.

**Entregable de la Fase 2:** la app instalada en el celular y la PC, mostrando tus datos. ✅

## Fase 3 – Base de alimentos

- **CENAN (Perú), edición 2025:** 1668 alimentos, incluidos ~440 platos preparados (lomo saltado, ají de gallina, arroz con pollo…), y medidas caseras oficiales (taza, cucharada, unidad mediana…) para 59 alimentos de uso diario.
- **USDA:** 8167 alimentos en inglés. Sirven para productos importados y para que Claude busque en inglés en la Fase 4.
- **Búsqueda:** sin tildes ni mayúsculas (“platano” encuentra “Plátano”) y con varias palabras en cualquier orden (“pollo arroz”). Primero aparecen tus alimentos, luego los de CENAN y al final los de USDA. Dentro de cada grupo van primero los que tienen medidas caseras.

### Cómo cargarlo (una sola vez)

En Supabase, abre **SQL Editor**. Para cada archivo, en este orden: pega todo su contenido y pulsa **Run**.

1. `supabase/migrations/20261125000100_busqueda_alimentos.sql` (activa la búsqueda nueva).
2. `catalogo_cenan.sql`: te lo envié aparte. No está en el repositorio porque la licencia de CENAN (CC BY-NC-ND) no permite publicar los datos modificados.
3. `datos/sql/catalogo_usda_1_de_4.sql` … `catalogo_usda_4_de_4.sql`.

Para probarlo, en la app ve a **Registrar → Comida** y busca “arroz”: debería salir “Arroz pilado o pulido cocido” con su taza de 193 g.

Los detalles y cómo regenerar los datos están en [`datos/README.md`](datos/README.md).

**Entregable de la Fase 3:** buscador de alimentos con valores confiables. ✅

> **Para la Fase 6 (hacerla pública):** los datos de CENAN son solo para uso **no comercial**. Si cobras por la app, hay que pedir permiso al INS o usar solo USDA.

## Fase 4 – Conector de Claude (MCP)

Con el conector, le dices o le mandas una foto a Claude ("almorcé arroz con pollo y una gaseosa") y él lo registra en tu app con los valores del catálogo.

- **Servidor MCP:** `https://personal-proyec.vercel.app/api/mcp`, dentro de la misma app de Next.js (Streamable HTTP).
- **Inicio de sesión:** OAuth 2.1 de **Supabase Auth**, con registro automático de clientes. Claude se registra solo, te envía a `/oauth/consent` para que le des permiso y Supabase le entrega un token. Con ese token, las reglas de seguridad (RLS) limitan todo a tus datos.
- **Herramientas:** `buscar_alimento`, `registrar_comida`, `resumen_dia`, `editar_registro`, `eliminar_registro`, `registrar_actividad`, `actualizar_peso`, `ver_objetivo` y `cambiar_objetivo`. La app y Claude comparten la misma lógica de registro (`src/lib/servicio.ts`).

### Conectarlo en Claude (una sola vez)

1. En **claude.ai** (o en la app de Claude) ve a **Configuración → Conectores → Agregar conector personalizado**.
2. Nombre: `Nutri`. URL: `https://personal-proyec.vercel.app/api/mcp`. Pulsa **Agregar**.
3. Pulsa **Conectar**. Se abrirá tu app: inicia sesión y pulsa **Permitir**.
4. (Recomendado) Crea un **Proyecto** en Claude llamado "Mi alimentación" con esta instrucción: *"Usa el conector Nutri para registrar lo que como. Si una cantidad es ambigua, pregúntame. Después de cada registro muéstrame el resumen del día."*

Desde el celular, en la app de Claude puedes usar el **modo de voz** o mandar una **foto** de tu plato o de una etiqueta.

**Entregable de la Fase 4:** le digo a Claude lo que comí y aparece en la app. ✅

## Extras: rachas, progreso y fotos

- **Rachas 🔥:** días seguidos registrando (al menos 3 comidas) y cumpliendo metas (calorías ±10 %, proteína desde 90 %, carbohidratos y grasas ±15 %). Las reglas están en `app/src/lib/racha.ts`.
- **Progreso:** comparación de esta semana con la anterior, barras de 8 semanas, calendario, peso y últimos días.
- **Fotos de progreso:** se guardan en el bucket **privado** `fotos-progreso` de Supabase Storage, dentro de la carpeta del usuario. Solo él puede verlas, subirlas o borrarlas (RLS), y se muestran con enlaces temporales de 1 hora. Antes de subirse se reducen a 1600 px y se les quitan los datos ocultos (GPS). Se pueden comparar lado a lado o con un deslizador, y la app sugiere una foto nueva cada 4 semanas. Claude puede verlas con `ver_fotos_progreso`, solo si el usuario se lo pide.

## Próximo paso: Fase 5

> Vamos con la Fase 5 del plan: etapas con fecha que cambian solas, ajuste semanal según la evolución del peso, recomendaciones de comidas según lo que falta del día y sugerencias básicas de entrenamiento.
