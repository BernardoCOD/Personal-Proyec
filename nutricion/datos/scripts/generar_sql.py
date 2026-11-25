"""Genera el SQL que carga el catálogo de alimentos en Supabase.

Uso:
    python3 -I generar_sql.py cenan  cenan.csv porciones_cenan.json  salida.sql
    python3 -I generar_sql.py usda   usda.csv  usda_porciones.csv    salida_base.sql [filas_por_archivo]

El SQL se puede ejecutar varias veces: actualiza lo que ya existe
(usa el índice único fuente + codigo_fuente). El de USDA se parte en varios
archivos porque el editor SQL de Supabase no acepta archivos muy grandes.
"""
import csv
import json
import sys

LOTE = 500


def texto(s):
    return "'" + str(s).replace("'", "''") + "'"


def numero(s):
    return "0" if s in (None, "") else repr(round(float(s), 2))


def insertar_alimentos(filas, fuente, marca=None):
    out = []
    for i in range(0, len(filas), LOTE):
        valores = ",\n".join(
            f"  (null, {texto(f['nombre'])}, {texto(marca(f)) if marca and marca(f) else 'null'}, "
            f"{numero(f['calorias'])}, {numero(f['proteina_g'])}, {numero(f['carbohidratos_g'])}, "
            f"{numero(f['grasa_g'])}, {numero(f['fibra_g'])}, '{fuente}', {texto(f['codigo'])})"
            for f in filas[i:i + LOTE]
        )
        out.append(
            "insert into public.alimentos (usuario_id, nombre, marca, calorias, proteina_g, carbohidratos_g, grasa_g, fibra_g, fuente, codigo_fuente) values\n"
            f"{valores}\n"
            "on conflict (fuente, codigo_fuente) where codigo_fuente is not null do update set\n"
            "  nombre = excluded.nombre, marca = excluded.marca, calorias = excluded.calorias, proteina_g = excluded.proteina_g,\n"
            "  carbohidratos_g = excluded.carbohidratos_g, grasa_g = excluded.grasa_g, fibra_g = excluded.fibra_g;\n"
        )
    return out


def insertar_porciones(porciones, fuente):
    out = []
    for i in range(0, len(porciones), LOTE):
        valores = ",\n".join(f"  ({texto(c)}, {texto(n)}, {numero(g)})" for c, n, g in porciones[i:i + LOTE])
        out.append(
            "insert into public.porciones (alimento_id, nombre, gramos)\n"
            "select a.id, v.nombre, v.gramos from (values\n"
            f"{valores}\n"
            ") as v(codigo, nombre, gramos)\n"
            f"join public.alimentos a on a.fuente = '{fuente}' and a.codigo_fuente = v.codigo\n"
            "on conflict (alimento_id, nombre) do update set gramos = excluded.gramos;\n"
        )
    return out


def escribir(ruta, encabezado, sentencias):
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(encabezado + "\nbegin;\n\n" + "\n".join(sentencias) + "\ncommit;\n")


def cenan(csv_path, porciones_path, salida):
    filas = [dict(f) for f in csv.DictReader(open(csv_path, encoding="utf-8"))]
    porciones_json = json.load(open(porciones_path, encoding="utf-8"))
    porciones = [(c, n, g) for c, ps in porciones_json.items() if not c.startswith("_") for n, g in ps.items()]
    encabezado = (
        "-- Catálogo CENAN: Tablas Peruanas de Composición de Alimentos (INS/CENAN, 2025)\n"
        "-- y medidas caseras de las Tablas auxiliares (INS/CENAN, 2016). Licencia CC BY-NC-ND:\n"
        "-- solo para uso personal, no comercial. Valores por 100 g de parte comestible.\n"
        f"-- {len(filas)} alimentos, {len(porciones)} porciones.\n"
    )
    escribir(salida, encabezado, insertar_alimentos(filas, "cenan") + insertar_porciones(porciones, "cenan"))
    print(f"{salida}: {len(filas)} alimentos, {len(porciones)} porciones", file=sys.stderr)


def usda(csv_path, porciones_path, salida_base, por_archivo=2500):
    filas = []
    for f in csv.DictReader(open(csv_path, encoding="utf-8")):
        f = dict(f)
        f["codigo"] = f["fdc_id"]
        filas.append(f)
    porciones = {}
    for p in csv.DictReader(open(porciones_path, encoding="utf-8")):
        porciones.setdefault(p["fdc_id"], []).append((p["fdc_id"], p["nombre"], p["gramos"]))
    partes = [filas[i:i + por_archivo] for i in range(0, len(filas), por_archivo)]
    for n, parte in enumerate(partes, 1):
        ps = [x for f in parte for x in porciones.get(f["codigo"], [])]
        salida = salida_base.replace(".sql", f"_{n}_de_{len(partes)}.sql")
        encabezado = (
            "-- Catálogo USDA FoodData Central (Foundation 2026-10 y SR Legacy 2018-04). Dominio público (CC0).\n"
            "-- Nombres en inglés. Valores por 100 g.\n"
            f"-- Parte {n} de {len(partes)}: {len(parte)} alimentos, {len(ps)} porciones.\n"
        )
        escribir(salida, encabezado, insertar_alimentos(parte, "usda") + insertar_porciones(ps, "usda"))
        print(f"{salida}: {len(parte)} alimentos, {len(ps)} porciones", file=sys.stderr)


if __name__ == "__main__":
    if sys.argv[1] == "cenan":
        cenan(*sys.argv[2:5])
    else:
        usda(sys.argv[2], sys.argv[3], sys.argv[4], *(int(x) for x in sys.argv[5:6]))
