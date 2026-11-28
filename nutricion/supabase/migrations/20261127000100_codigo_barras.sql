-- =====================================================================
-- Productos con código de barras
-- Al escanear un producto se guarda como alimento propio (fuente
-- 'etiqueta') con su código, para encontrarlo al instante la próxima vez.
-- =====================================================================

alter table public.alimentos
  add column codigo_barras text check (codigo_barras ~ '^\d{6,14}$');

-- Un mismo código una sola vez por usuario.
create unique index alimentos_usuario_codigo_barras
  on public.alimentos (usuario_id, codigo_barras)
  where codigo_barras is not null;
