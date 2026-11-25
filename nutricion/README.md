# App de nutrición conectada a Claude

App personal para registrar comidas, macros, peso y actividad física. Claude registra las comidas mediante un conector MCP y la app (PWA) muestra los datos en el celular y en la PC.

Este proyecto es independiente del **Centro de Mando** que está en la raíz del repositorio.

| Fase | Estado |
|---|---|
| 1. Base de datos (Supabase) | ✅ Esquema listo: `supabase/migrations/` |
| 2. App web instalable | Pendiente |
| 3. Base de alimentos (CENAN + USDA) | Pendiente |
| 4. Conector MCP para Claude | Pendiente |
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

## Próximo paso: Fase 2

Prompt sugerido para Claude Code:

> Vamos a construir la Fase 2 del plan. Crea en `nutricion/app` una app Next.js + Tailwind instalable (PWA) que use el esquema de `nutricion/supabase/migrations`: inicio de sesión, registro inicial con el cuestionario de actividad, cálculo de metabolismo basal (Mifflin-St Jeor) y gasto diario, panel del día e historial de peso.
