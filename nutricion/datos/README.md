# Catálogo de alimentos (Fase 3)

| Fuente | Alimentos | Porciones caseras | Licencia | ¿En el repositorio? |
|---|---|---|---|---|
| **Tablas Peruanas de Composición de Alimentos** (INS/CENAN, edición 2025) | 1668, incluidos ~440 platos preparados peruanos | 146 en 59 alimentos de uso diario, de las *Tablas auxiliares* (INS/CENAN, 2016) | CC BY-NC-ND: uso personal y no comercial | **No.** Se genera en `privado/` (ignorado por git) |
| **USDA FoodData Central** (Foundation 2026-10 y SR Legacy 2018-04) | 8167, con nombres en inglés | 10 942 | Dominio público (CC0) | Sí: `sql/catalogo_usda_*.sql` |

Todos los valores son **por 100 g de parte comestible**. En CENAN, “•” (sin dato) se carga como 0. Los carbohidratos son **totales** (incluyen la fibra), igual que en USDA.

## Cargarlo en Supabase

Antes, ejecuta la migración `supabase/migrations/20261125000100_busqueda_alimentos.sql`. Después, en el **SQL Editor**, abre cada archivo, pega todo su contenido y pulsa **Run**:

1. `catalogo_cenan.sql` (te lo pasé aparte, porque no va en el repositorio).
2. `sql/catalogo_usda_1_de_4.sql`, `_2_de_4`, `_3_de_4` y `_4_de_4`.

Cada archivo es una sola transacción: si algo falla, no se carga nada a medias. Se pueden volver a ejecutar sin crear duplicados, porque actualizan los alimentos que ya existen.

## Regenerarlo

Necesitas Python 3 y `pdftotext` (paquete `poppler-utils`).

```bash
cd nutricion/datos

# CENAN: descarga el PDF de repositorio.ins.gob.pe ("Tablas peruanas de composición de alimentos", 2025)
pdftotext -layout tpca-2025.pdf /tmp/tabla.txt
python3 -I scripts/extraer_cenan.py /tmp/tabla.txt privado/cenan.csv
python3 -I scripts/generar_sql.py cenan privado/cenan.csv privado/porciones_cenan.json privado/catalogo_cenan.sql

# USDA: descarga los JSON de Foundation y SR Legacy de fdc.nal.usda.gov/download-datasets
python3 -I scripts/extraer_usda.py /tmp FoodData_Central_foundation_food_json_*.json FoodData_Central_sr_legacy_food_json_*.json
python3 -I scripts/generar_sql.py usda /tmp/usda.csv /tmp/usda_porciones.csv sql/catalogo_usda.sql
```

### Cómo se extrae CENAN

El PDF tiene tres formatos de fila: código, nombre y números en una sola línea; nombre partido arriba y abajo de los números; o código solo en su línea y los datos debajo. `extraer_cenan.py` maneja los tres. Se comprobó que:

- Todos los códigos del PDF quedan extraídos (falta uno, SS293, que el PDF no trae completo).
- En una muestra al azar, los valores coinciden con el PDF.
- La energía coincide con 4·proteína + 4·carbohidratos + 9·grasa. Las únicas diferencias grandes son alimentos con mucha fibra (menestras, especias), donde CENAN usa factores específicos.

Se excluye el grupo Q (fórmulas infantiles).

`privado/porciones_cenan.json` se armó a mano a partir de las *Tablas auxiliares*. Cada medida se emparejó con su alimento de CENAN comprobando que las kcal por gramo de la medida coinciden con las del alimento. La “taza” es una taza de loza al ras, salvo que el nombre diga otra cosa.
