-- Pruebas del esquema y de las políticas RLS. Cada prueba lanza un error
-- si falla; si el archivo termina sin errores, todo pasó.
\set ON_ERROR_STOP on

-- Dos usuarios: Ana y Beto (el trigger les crea el perfil).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com',  '{"nombre":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@example.com', '{"nombre":"Beto"}');

do $$ begin
  assert (select count(*) from public.perfiles) = 2, 'el trigger debe crear 2 perfiles';
  assert (select nombre from public.perfiles where id = '11111111-1111-1111-1111-111111111111') = 'Ana',
    'el nombre del perfil debe venir de los metadatos';
end $$;

-- Catálogo público (cargado con la clave de servicio, sin usuario).
insert into public.alimentos (id, usuario_id, nombre, calorias, proteina_g, carbohidratos_g, grasa_g, fuente, codigo_fuente)
values ('aaaaaaaa-0000-0000-0000-000000000001', null, 'Arroz blanco cocido', 130, 2.7, 28.2, 0.3, 'cenan', 'A001');
insert into public.porciones (alimento_id, nombre, gramos)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'taza', 160);

-- ---------------- Como Ana ----------------
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); end $$;

update public.perfiles set sexo = 'femenino', fecha_nacimiento = '1998-05-10', talla_cm = 162,
  nivel_actividad = 'moderado', dias_gimnasio = 4, tipo_ejercicio = '{fuerza,cardio}';
insert into public.mediciones_peso (peso_kg) values (58.4);
insert into public.objetivos (tipo, meta_calorias, meta_proteina_g, meta_carbohidratos_g, meta_grasas_g)
values ('ganar_musculo', 2200, 120, 260, 70);

insert into public.comidas (id, tipo, fecha_hora)
values ('cccccccc-0000-0000-0000-000000000001', 'almuerzo', '2026-11-25 13:00-05');
insert into public.comida_items (comida_id, alimento_id, nombre_alimento, cantidad, unidad, gramos,
  calorias, proteina_g, carbohidratos_g, grasa_g)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
  'Arroz blanco cocido', 200, 'g', 200, 260, 5.4, 56.4, 0.6);
insert into public.actividades (tipo, duracion_min, intensidad, calorias_estimadas)
values ('pesas', 60, 'alta', 350);

-- Alimento propio de Ana, con una porción.
insert into public.alimentos (id, nombre, calorias) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Batido de Ana', 90);
insert into public.porciones (alimento_id, nombre, gramos) values ('aaaaaaaa-0000-0000-0000-000000000002', 'vaso', 300);

do $$ begin
  assert (select count(*) from public.perfiles) = 1, 'Ana solo ve su perfil';
  assert (select count(*) from public.alimentos) = 2, 'Ana ve el catálogo y su alimento';
  assert (select count(*) from public.porciones) = 2, 'Ana ve porciones del catálogo y las suyas';
  assert (select calorias from public.resumen_diario where fecha = '2026-11-25') = 260,
    'el resumen diario suma las calorías del día (hora de Lima)';
end $$;

-- Resumen por día (rachas y progreso).
do $$
declare d record;
begin
  select * into d from public.dias_resumen('2026-11-20', '2026-11-30');
  assert d.fecha = '2026-11-25' and d.secciones = 1 and d.calorias = 260, 'dias_resumen: día, comidas y kcal';
  assert d.meta_calorias = 2200 and d.meta_proteina_g = 120, 'dias_resumen: metas de la etapa vigente';
  assert (select count(*) from public.dias_resumen('2026-11-26', '2026-11-30')) = 0, 'dias_resumen: fuera de rango';
  assert (select count(*) from public.dias_resumen('2025-01-01', '2026-11-30')) = 0, 'dias_resumen: máximo 400 días';
end $$;

-- Búsqueda (Fase 3): sin tildes, varias palabras, respeta RLS y orden.
reset role;
insert into public.alimentos (usuario_id, nombre, calorias, fuente, codigo_fuente) values
  (null, 'Plátano de seda', 74, 'cenan', 'C71'),
  (null, 'Arroz con pollo', 150, 'cenan', 'SS20'),
  (null, 'Bananas, raw', 89, 'usda', '173944');
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); end $$;
do $$ begin
  assert (select count(*) from public.buscar_alimentos('platano')) = 1, 'sin tildes: platano -> Plátano';
  assert (select nombre from public.buscar_alimentos('POLLO arroz')) = 'Arroz con pollo', 'varias palabras en cualquier orden';
  assert (select nombre from public.buscar_alimentos('batido')) = 'Batido de Ana', 'encuentra mis alimentos';
  assert (select porciones from public.buscar_alimentos('arroz blanco')) = '[{"nombre": "taza", "gramos": 160.00}]'::jsonb, 'trae las porciones';
  assert (select count(*) from public.buscar_alimentos('a')) = 0, 'mínimo 2 letras';
  assert (select count(*) from public.buscar_alimentos('platanos')) = 1, 'plural: platanos -> Plátano';
  assert (select nombre from public.buscar_alimentos('pollos arroz')) = 'Arroz con pollo', 'plural de varias palabras';
  assert (select count(*) from public.buscar_alimentos('100%')) = 0, 'el % se busca literal';
  assert (select fuente from public.buscar_alimentos('a', 5) limit 1) is null, 'sin resultados con 1 letra';
end $$;

-- Ana no puede modificar el catálogo público.
do $$ begin
  update public.alimentos set calorias = 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert not found, 'Ana no debe poder editar el catálogo';
  insert into public.porciones (alimento_id, nombre, gramos) values ('aaaaaaaa-0000-0000-0000-000000000001', 'plato', 250);
  raise exception 'Ana no debe poder agregar porciones al catálogo';
exception when insufficient_privilege then null;
end $$;

-- Solo un objetivo activo a la vez.
do $$ begin
  insert into public.objetivos (tipo, meta_calorias, meta_proteina_g, meta_carbohidratos_g, meta_grasas_g)
  values ('mantener', 2000, 100, 240, 65);
  raise exception 'no debe haber dos objetivos activos';
exception when unique_violation then null;
end $$;

-- ---------------- Como Beto ----------------
do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false); end $$;

do $$ begin
  assert (select count(*) from public.perfiles) = 1, 'Beto solo ve su perfil';
  assert (select count(*) from public.mediciones_peso) = 0, 'Beto no ve el peso de Ana';
  assert (select count(*) from public.objetivos) = 0, 'Beto no ve los objetivos de Ana';
  assert (select count(*) from public.comidas) = 0, 'Beto no ve las comidas de Ana';
  assert (select count(*) from public.comida_items) = 0, 'Beto no ve los items de Ana';
  assert (select count(*) from public.actividades) = 0, 'Beto no ve las actividades de Ana';
  assert (select count(*) from public.alimentos) = 1 + 3, 'Beto solo ve el catálogo, no el alimento de Ana';
  assert (select count(*) from public.porciones) = 1, 'Beto no ve las porciones del alimento de Ana';
  assert (select count(*) from public.resumen_diario) = 0, 'Beto no ve el resumen de Ana';
  assert (select count(*) from public.dias_resumen('2026-11-01', '2026-11-30')) = 0, 'Beto no ve los días de Ana';
  assert (select count(*) from public.buscar_alimentos('batido')) = 0, 'Beto no encuentra el alimento de Ana';
  assert (select count(*) from public.buscar_alimentos('platano')) = 1, 'Beto sí ve el catálogo';
end $$;

-- Código de barras: Beto puede guardar el mismo producto que Ana, pero no dos veces.
reset role;
insert into public.alimentos (usuario_id, nombre, calorias, fuente, codigo_barras)
values ('11111111-1111-1111-1111-111111111111', 'Leche evaporada', 133, 'etiqueta', '7750885006513');
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false); end $$;
insert into public.alimentos (nombre, calorias, fuente, codigo_barras) values ('Leche evaporada', 133, 'etiqueta', '7750885006513');
do $$ begin
  assert (select count(*) from public.alimentos where codigo_barras = '7750885006513') = 1, 'Beto solo ve su propio producto escaneado';
  insert into public.alimentos (nombre, calorias, fuente, codigo_barras) values ('Otra', 1, 'etiqueta', '7750885006513');
  raise exception 'no debe repetirse el código para el mismo usuario';
exception when unique_violation then null;
end $$;
do $$ begin
  insert into public.alimentos (nombre, calorias, fuente, codigo_barras) values ('Mal', 1, 'etiqueta', 'abc');
  raise exception 'el código debe ser numérico';
exception when check_violation then null;
end $$;
delete from public.alimentos where codigo_barras = '7750885006513';

-- Fotos de progreso: cada uno solo ve y sube en su carpeta.
reset role;
insert into storage.objects (bucket_id, name, owner) values ('fotos-progreso', '11111111-1111-1111-1111-111111111111/a.jpg', '11111111-1111-1111-1111-111111111111');
insert into public.fotos_progreso (usuario_id, fecha, ruta) values ('11111111-1111-1111-1111-111111111111', '2026-11-01', '11111111-1111-1111-1111-111111111111/a.jpg');
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false); end $$;
do $$ begin
  assert (select count(*) from public.fotos_progreso) = 0, 'Beto no ve las fotos de Ana';
  assert (select count(*) from storage.objects where bucket_id = 'fotos-progreso') = 0, 'Beto no ve los archivos de Ana';
end $$;
insert into storage.objects (bucket_id, name) values ('fotos-progreso', '22222222-2222-2222-2222-222222222222/b.jpg');
insert into public.fotos_progreso (fecha, ruta) values ('2026-11-02', '22222222-2222-2222-2222-222222222222/b.jpg');
do $$ begin
  assert (select count(*) from public.fotos_progreso) = 1, 'Beto ve su propia foto';
  insert into storage.objects (bucket_id, name) values ('fotos-progreso', '11111111-1111-1111-1111-111111111111/intruso.jpg');
  raise exception 'Beto no debe subir archivos en la carpeta de Ana';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.fotos_progreso (fecha, ruta) values ('2026-11-02', '11111111-1111-1111-1111-111111111111/x.jpg');
  raise exception 'la ruta debe estar en la carpeta del propio usuario';
exception when check_violation then null;
end $$;
do $$ begin
  delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/a.jpg';
  assert not found, 'Beto no puede borrar el archivo de Ana';
end $$;

-- Beto no puede editar ni borrar datos de Ana.
do $$ begin
  update public.perfiles set nombre = 'hackeado' where id = '11111111-1111-1111-1111-111111111111';
  assert not found, 'Beto no debe editar el perfil de Ana';
  delete from public.comidas where id = 'cccccccc-0000-0000-0000-000000000001';
  assert not found, 'Beto no debe borrar comidas de Ana';
end $$;

-- Beto no puede escribir datos a nombre de Ana.
do $$ begin
  insert into public.mediciones_peso (usuario_id, peso_kg) values ('11111111-1111-1111-1111-111111111111', 99);
  raise exception 'Beto no debe crear pesos a nombre de Ana';
exception when insufficient_privilege then null;
end $$;

-- Beto no puede meter alimentos en la comida de Ana (ni siquiera a su nombre).
do $$ begin
  insert into public.comida_items (comida_id, nombre_alimento, cantidad, unidad, gramos, calorias)
  values ('cccccccc-0000-0000-0000-000000000001', 'Intruso', 1, 'g', 1, 1);
  raise exception 'Beto no debe agregar items a la comida de Ana';
exception when foreign_key_violation then null;
end $$;

-- ---------------- Sin sesión (anon) ----------------
reset role;
set role anon;
do $$ begin perform set_config('request.jwt.claim.sub', '', false); end $$;
do $$ begin
  assert (select count(*) from public.alimentos) = 0, 'sin sesión no se ve nada';
  assert (select count(*) from public.comidas) = 0, 'sin sesión no se ve nada';
end $$;

-- ---------------- Borrar la cuenta borra todo ----------------
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.comidas) = 0, 'al borrar la cuenta se borran sus comidas';
  assert (select count(*) from public.comida_items) = 0, 'y sus items';
  assert (select count(*) from public.alimentos) = 1 + 3, 'y sus alimentos, pero no el catálogo';
end $$;

\echo 'TODAS LAS PRUEBAS PASARON'
