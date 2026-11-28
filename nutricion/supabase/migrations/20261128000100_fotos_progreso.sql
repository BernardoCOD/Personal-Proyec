-- =====================================================================
-- Fotos de progreso (privadas)
-- - El archivo va al bucket privado "fotos-progreso", en la carpeta
--   <id del usuario>/. Solo su dueño puede verlo, subirlo o borrarlo.
-- - La tabla guarda la fecha, la vista (frente, perfil, espalda), el
--   peso de ese día y una nota.
-- =====================================================================

create table public.fotos_progreso (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha       date not null default current_date,
  vista       text not null default 'frente' check (vista in ('frente', 'perfil', 'espalda')),
  ruta        text not null unique,      -- <usuario_id>/<uuid>.jpg dentro del bucket
  peso_kg     numeric(5, 2) check (peso_kg between 20 and 400),
  notas       text check (length(notas) <= 300),
  created_at  timestamptz not null default now(),
  -- La ruta tiene que estar dentro de la carpeta del propio usuario.
  check (ruta like usuario_id::text || '/%')
);

create index fotos_progreso_usuario_fecha on public.fotos_progreso (usuario_id, fecha);

alter table public.fotos_progreso enable row level security;

create policy "fotos_progreso: solo las propias" on public.fotos_progreso
  for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- Bucket privado: máximo 5 MB por foto, solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-progreso', 'fotos-progreso', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Archivos: cada usuario solo dentro de su carpeta.
create policy "fotos-progreso: ver las propias" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-progreso' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos-progreso: subir en mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-progreso' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos-progreso: borrar las propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-progreso' and (storage.foldername(name))[1] = (select auth.uid())::text);
