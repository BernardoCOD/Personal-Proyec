-- =====================================================================
-- Resumen por día para rachas y el panel de progreso
-- Por cada día con registros: cuántas comidas distintas (desayuno,
-- almuerzo, cena, snack), totales de calorías y macros, y las metas de
-- la etapa vigente ese día. Respeta RLS (security invoker).
-- =====================================================================

create or replace function public.dias_resumen(desde date, hasta date)
returns table (
  fecha date,
  secciones integer,
  calorias numeric,
  proteina_g numeric,
  carbohidratos_g numeric,
  grasa_g numeric,
  meta_calorias integer,
  meta_proteina_g numeric,
  meta_carbohidratos_g numeric,
  meta_grasas_g numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with z as (
    select coalesce((select p.zona_horaria from public.perfiles p where p.id = auth.uid()), 'America/Lima') as zona
  ), dias as (
    select (c.fecha_hora at time zone z.zona)::date as fecha,
           count(distinct c.tipo)::integer as secciones,
           sum(i.calorias) as calorias,
           sum(i.proteina_g) as proteina_g,
           sum(i.carbohidratos_g) as carbohidratos_g,
           sum(i.grasa_g) as grasa_g
    from public.comidas c
    join public.comida_items i on i.comida_id = c.id
    cross join z
    where c.usuario_id = auth.uid()
      and hasta >= desde and hasta - desde <= 400
      and c.fecha_hora >= (desde::timestamp at time zone z.zona)
      and c.fecha_hora < ((hasta + 1)::timestamp at time zone z.zona)
    group by 1
  )
  select d.fecha, d.secciones, round(d.calorias, 1), round(d.proteina_g, 1), round(d.carbohidratos_g, 1), round(d.grasa_g, 1),
         o.meta_calorias, o.meta_proteina_g, o.meta_carbohidratos_g, o.meta_grasas_g
  from dias d
  -- La etapa vigente ese día: la última que empezó antes o ese día; si no hay, la primera.
  left join lateral (
    select ob.meta_calorias, ob.meta_proteina_g, ob.meta_carbohidratos_g, ob.meta_grasas_g
    from public.objetivos ob
    where ob.usuario_id = auth.uid()
    order by (ob.fecha_inicio <= d.fecha) desc,
             case when ob.fecha_inicio <= d.fecha then ob.fecha_inicio end desc nulls last,
             ob.fecha_inicio asc,
             ob.created_at desc
    limit 1
  ) o on true
  order by d.fecha
$$;

revoke execute on function public.dias_resumen(date, date) from public, anon;
grant execute on function public.dias_resumen(date, date) to authenticated;
