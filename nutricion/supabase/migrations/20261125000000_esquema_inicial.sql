-- =====================================================================
-- App de nutrición – Fase 1: esquema inicial
--
-- Crea las tablas, activa Row Level Security (RLS) en todas ellas y
-- define políticas para que cada usuario solo pueda ver y modificar sus
-- propios datos. El catálogo público de alimentos (CENAN, USDA) lo puede
-- leer cualquier usuario con sesión iniciada, pero solo se carga con la
-- clave de servicio (Fase 3).
--
-- Se puede pegar completo en el SQL Editor de Supabase y ejecutar una vez.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------

-- Actualiza la columna updated_at en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- perfiles: un registro por usuario (mismo id que auth.users)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nombre            text,
  sexo              text check (sexo in ('masculino', 'femenino')),
  fecha_nacimiento  date check (fecha_nacimiento > '1900-01-01'),
  talla_cm          numeric(5, 1) check (talla_cm between 50 and 260),
  -- Cuestionario de actividad física
  nivel_actividad   text check (nivel_actividad in ('sedentario', 'ligero', 'moderado', 'muy_activo', 'extremo')),
  dias_gimnasio     smallint check (dias_gimnasio between 0 and 7),
  tipo_ejercicio    text[] not null default '{}'
                    check (tipo_ejercicio <@ array['fuerza', 'cardio', 'mixto', 'deporte', 'ninguno']),
  zona_horaria      text not null default 'America/Lima',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.perfiles is 'Datos personales y cuestionario de actividad. Los campos quedan vacíos hasta completar el registro inicial.';

create trigger perfiles_updated_at
  before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Crea el perfil automáticamente cuando alguien se registra.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, new.raw_user_meta_data ->> 'nombre');
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- mediciones_peso: evolución del peso (una medición por día)
-- ---------------------------------------------------------------------
create table public.mediciones_peso (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha       date not null default current_date,
  peso_kg     numeric(5, 2) not null check (peso_kg between 20 and 400),
  notas       text,
  created_at  timestamptz not null default now(),
  unique (usuario_id, fecha)
);

-- ---------------------------------------------------------------------
-- objetivos: etapas (ganar músculo, mantener, bajar grasa)
-- ---------------------------------------------------------------------
create table public.objetivos (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo              text not null check (tipo in ('ganar_musculo', 'mantener', 'bajar_grasa')),
  fecha_inicio      date not null default current_date,
  fecha_fin         date,
  meta_calorias     integer not null check (meta_calorias between 800 and 8000),
  meta_proteina_g   numeric(6, 1) not null check (meta_proteina_g >= 0),
  meta_carbohidratos_g numeric(6, 1) not null check (meta_carbohidratos_g >= 0),
  meta_grasas_g     numeric(6, 1) not null check (meta_grasas_g >= 0),
  activo            boolean not null default true,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

-- Solo un objetivo activo a la vez por usuario.
create unique index objetivos_un_activo_por_usuario
  on public.objetivos (usuario_id) where activo;

create trigger objetivos_updated_at
  before update on public.objetivos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- alimentos: valores nutricionales por 100 g
--   usuario_id NULL  -> catálogo público (CENAN, USDA), solo lectura
--   usuario_id = yo  -> alimento o receta creada por mí
-- ---------------------------------------------------------------------
create table public.alimentos (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid default auth.uid() references auth.users (id) on delete cascade,
  nombre           text not null check (length(trim(nombre)) > 0),
  marca            text,
  calorias         numeric(7, 2) not null check (calorias >= 0),
  proteina_g       numeric(6, 2) not null default 0 check (proteina_g >= 0),
  carbohidratos_g  numeric(6, 2) not null default 0 check (carbohidratos_g >= 0),
  grasa_g          numeric(6, 2) not null default 0 check (grasa_g >= 0),
  fibra_g          numeric(6, 2) not null default 0 check (fibra_g >= 0),
  fuente           text not null default 'usuario'
                   check (fuente in ('cenan', 'usda', 'receta', 'usuario', 'etiqueta')),
  codigo_fuente    text,   -- código en la tabla original (CENAN / FDC id de USDA)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.alimentos.calorias is 'kcal por 100 g';

-- Evita cargar dos veces el mismo alimento de una misma fuente.
create unique index alimentos_fuente_codigo
  on public.alimentos (fuente, codigo_fuente) where codigo_fuente is not null;

-- Búsqueda rápida por nombre (también con errores de tipeo).
create index alimentos_nombre_trgm
  on public.alimentos using gin (lower(nombre) extensions.gin_trgm_ops);

create index alimentos_usuario on public.alimentos (usuario_id);

create trigger alimentos_updated_at
  before update on public.alimentos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- porciones: equivalencias caseras ("1 taza de arroz = 160 g")
-- ---------------------------------------------------------------------
create table public.porciones (
  id           uuid primary key default gen_random_uuid(),
  alimento_id  uuid not null references public.alimentos (id) on delete cascade,
  nombre       text not null check (length(trim(nombre)) > 0),  -- taza, cucharada, unidad, plato...
  gramos       numeric(7, 2) not null check (gramos > 0),
  created_at   timestamptz not null default now(),
  unique (alimento_id, nombre)
);

-- ---------------------------------------------------------------------
-- comidas: cada desayuno, almuerzo, cena o snack
-- ---------------------------------------------------------------------
create table public.comidas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha_hora  timestamptz not null default now(),
  tipo        text not null check (tipo in ('desayuno', 'almuerzo', 'cena', 'snack')),
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Permite que comida_items apunte a (id, usuario_id) y así garantizar
  -- que nadie agregue alimentos a la comida de otra persona.
  unique (id, usuario_id)
);

create index comidas_usuario_fecha on public.comidas (usuario_id, fecha_hora desc);

create trigger comidas_updated_at
  before update on public.comidas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- comida_items: cada alimento de una comida
-- Los valores nutricionales se guardan "congelados" en el momento del
-- registro: si después se corrige el alimento, el historial no cambia.
-- ---------------------------------------------------------------------
create table public.comida_items (
  id               uuid primary key default gen_random_uuid(),
  comida_id        uuid not null,
  usuario_id       uuid not null default auth.uid(),
  alimento_id      uuid references public.alimentos (id) on delete set null,
  nombre_alimento  text not null,
  cantidad         numeric(8, 2) not null check (cantidad > 0),
  unidad           text not null,            -- g, kg, lb, oz, ml, taza, unidad...
  gramos           numeric(8, 2) not null check (gramos > 0),
  calorias         numeric(8, 2) not null check (calorias >= 0),
  proteina_g       numeric(7, 2) not null default 0 check (proteina_g >= 0),
  carbohidratos_g  numeric(7, 2) not null default 0 check (carbohidratos_g >= 0),
  grasa_g          numeric(7, 2) not null default 0 check (grasa_g >= 0),
  fibra_g          numeric(7, 2) not null default 0 check (fibra_g >= 0),
  created_at       timestamptz not null default now(),
  foreign key (comida_id, usuario_id)
    references public.comidas (id, usuario_id) on delete cascade
);

create index comida_items_comida on public.comida_items (comida_id);
create index comida_items_usuario on public.comida_items (usuario_id);
create index comida_items_alimento on public.comida_items (alimento_id);

-- ---------------------------------------------------------------------
-- actividades: ejercicio del día
-- ---------------------------------------------------------------------
create table public.actividades (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha_hora          timestamptz not null default now(),
  tipo                text not null,             -- pesas, correr, fútbol, caminar...
  duracion_min        integer not null check (duracion_min between 1 and 1440),
  intensidad          text not null check (intensidad in ('baja', 'moderada', 'alta')),
  calorias_estimadas  integer check (calorias_estimadas >= 0),
  notas               text,
  created_at          timestamptz not null default now()
);

create index actividades_usuario_fecha on public.actividades (usuario_id, fecha_hora desc);

-- =====================================================================
-- Row Level Security
-- (select auth.uid()) se evalúa una sola vez por consulta: más rápido.
-- =====================================================================
alter table public.perfiles         enable row level security;
alter table public.mediciones_peso  enable row level security;
alter table public.objetivos        enable row level security;
alter table public.alimentos        enable row level security;
alter table public.porciones        enable row level security;
alter table public.comidas          enable row level security;
alter table public.comida_items     enable row level security;
alter table public.actividades      enable row level security;

-- perfiles: el perfil lo crea el trigger y se borra junto con la cuenta.
create policy "perfiles: ver el propio" on public.perfiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfiles: editar el propio" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Tablas que pertenecen por completo a un usuario.
create policy "mediciones_peso: solo las propias" on public.mediciones_peso
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create policy "objetivos: solo los propios" on public.objetivos
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create policy "comidas: solo las propias" on public.comidas
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create policy "comida_items: solo los propios" on public.comida_items
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create policy "actividades: solo las propias" on public.actividades
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- alimentos: ver el catálogo público y los propios; modificar solo los propios.
create policy "alimentos: ver catálogo y propios" on public.alimentos
  for select to authenticated
  using (usuario_id is null or usuario_id = (select auth.uid()));
create policy "alimentos: crear propios" on public.alimentos
  for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy "alimentos: editar propios" on public.alimentos
  for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "alimentos: borrar propios" on public.alimentos
  for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- porciones: siguen los permisos del alimento al que pertenecen.
create policy "porciones: ver si veo el alimento" on public.porciones
  for select to authenticated
  using (exists (
    select 1 from public.alimentos a
    where a.id = alimento_id
      and (a.usuario_id is null or a.usuario_id = (select auth.uid()))
  ));
create policy "porciones: modificar las de mis alimentos" on public.porciones
  for all to authenticated
  using (exists (
    select 1 from public.alimentos a
    where a.id = alimento_id and a.usuario_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.alimentos a
    where a.id = alimento_id and a.usuario_id = (select auth.uid())
  ));

-- =====================================================================
-- Vista: totales por día (para el panel y para resumen_dia del conector)
-- security_invoker hace que la vista respete el RLS de quien la consulta.
-- =====================================================================
create view public.resumen_diario
with (security_invoker = true) as
select
  c.usuario_id,
  (c.fecha_hora at time zone coalesce(p.zona_horaria, 'America/Lima'))::date as fecha,
  count(distinct c.id)                    as comidas,
  coalesce(sum(i.calorias), 0)            as calorias,
  coalesce(sum(i.proteina_g), 0)          as proteina_g,
  coalesce(sum(i.carbohidratos_g), 0)     as carbohidratos_g,
  coalesce(sum(i.grasa_g), 0)             as grasa_g,
  coalesce(sum(i.fibra_g), 0)             as fibra_g
from public.comidas c
left join public.perfiles p on p.id = c.usuario_id
left join public.comida_items i on i.comida_id = c.id
group by c.usuario_id, 2;
