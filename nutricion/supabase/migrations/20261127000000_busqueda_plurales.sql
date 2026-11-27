-- =====================================================================
-- Búsqueda: plurales y masculino/femenino
-- "panes" encuentra "Pan", "plátanos fritos" encuentra "Plátano ... frito",
-- "papa frita" y "papas fritas" encuentran lo mismo.
-- =====================================================================

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
    -- Raíz simple para plurales y género: "panes" -> "pan", "fritos" -> "frit"
    -- (encuentra frito/frita), "platanos" -> "platan". Solo palabras de 4+ letras.
    select '%' || replace(replace(replace(
             case
               when length(w) >= 5 and w ~ 'es$' and w !~ '(ces|ses)$' then left(w, -2)
               when length(w) >= 5 and w ~ '(os|as)$' then left(w, -2)
               when length(w) >= 5 and w ~ '[oa]$' then left(w, -1)
               when length(w) >= 4 and w ~ '[^s]s$' then left(w, -1)
               else w
             end, '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
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

