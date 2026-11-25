#!/usr/bin/env bash
# Prueba las migraciones en un PostgreSQL local (no toca Supabase).
# Uso: bash nutricion/supabase/tests/run.sh   (necesita psql y permisos para crear bases)
set -euo pipefail
cd "$(dirname "$0")"
DB=nutricion_test
PSQL=(psql -v ON_ERROR_STOP=1 -q)

dropdb --if-exists "$DB"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

"${PSQL[@]}" -d "$DB" -f supabase_stub.sql
for f in ../migrations/*.sql; do
  echo "Aplicando $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -f rls_test.sql
