-- =====================================================================
-- App de nutrición – Fase 3: búsqueda de alimentos
--
-- - Búsqueda sin tildes ni mayúsculas ("platano" encuentra "Plátano").
-- - Varias palabras en cualquier orden ("arroz pollo" encuentra
--   "Arroz con pollo").
-- - Orden: primero los que empiezan con lo escrito; luego mis alimentos,
--   CENAN (Perú) y USDA; los que tienen medidas caseras; los nombres más cortos.
-- Ejecutar después de 20261125000000_esquema_inicial.sql.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- unaccent() no es "immutable"; esta envoltura sí, para poder indexarla.
create or replace function public.normalizar(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, '')))
$$;

alter table public.alimentos
  add column nombre_normalizado text generated always as (public.normalizar(nombre)) stored;

drop index if exists public.alimentos_nombre_trgm;
create index alimentos_nombre_normalizado_trgm
  on public.alimentos using gin (nombre_normalizado extensions.gin_trgm_ops);

create index porciones_alimento on public.porciones (alimento_id);

-- Devuelve los alimentos visibles para quien llama (respeta RLS).
create or replace function public.buscar_alimentos(texto text, limite integer default 25)
returns table (
  id uuid,
  nombre text,
  marca text,
  fuente text,
  calorias numeric,
  proteina_g numeric,
  carbohidratos_g numeric,
  grasa_g numeric,
  fibra_g numeric,
  porciones jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.normalizar(trim(texto)) as t
  ), palabras as (
    select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
    from q, unnest(string_to_array(q.t, ' ')) as w
    where w <> ''
  )
  select a.id, a.nombre, a.marca, a.fuente, a.calorias, a.proteina_g, a.carbohidratos_g, a.grasa_g, a.fibra_g,
         coalesce((
           select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'gramos', p.gramos) order by p.gramos)
           from public.porciones p where p.alimento_id = a.id
         ), '[]'::jsonb)
  from public.alimentos a, q
  where length(q.t) >= 2
    and (select count(*) from palabras) > 0
    and a.nombre_normalizado like all (select patron from palabras)
  order by
    a.nombre_normalizado like (q.t || '%') desc,
    case a.fuente when 'usuario' then 0 when 'receta' then 1 when 'cenan' then 2 when 'etiqueta' then 3 else 4 end,
    -- Los que tienen medidas caseras son los de uso diario (arroz cocido, huevo, pan...).
    exists (select 1 from public.porciones p where p.alimento_id = a.id) desc,
    length(a.nombre),
    a.nombre
  limit least(greatest(coalesce(limite, 25), 1), 100)
$$;

revoke execute on function public.buscar_alimentos(text, integer) from public, anon;
grant execute on function public.buscar_alimentos(text, integer) to authenticated;
