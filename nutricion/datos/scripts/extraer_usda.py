"""Extrae alimentos de USDA FoodData Central (Foundation y SR Legacy) a CSV.

Uso:
    python3 -I extraer_usda.py salida_dir archivo1.json [archivo2.json ...]

Descarga los JSON de https://fdc.nal.usda.gov/download-datasets/ (dominio
público, CC0). Genera usda.csv (valores por 100 g) y usda_porciones.csv.
"""
import csv
import json
import os
import re
import sys

# Energía: preferir la declarada (208); si no, Atwater específicos (958) o generales (957).
ENERGIA = ("208", "958", "957")
CAMPOS = {"203": "proteina_g", "204": "grasa_g", "205": "carbohidratos_g", "291": "fibra_g"}

UNIDADES = {
    "cup": "taza", "tablespoon": "cucharada", "tbsp": "cucharada", "teaspoon": "cucharadita", "tsp": "cucharadita",
    "oz": "onza", "fl oz": "onza líquida", "slice": "tajada", "piece": "pieza", "serving": "porción",
    "steak": "bistec", "fillet": "filete", "roast": "asado", "jar": "frasco", "can": "lata", "package": "paquete",
    "container": "envase", "bottle": "botella", "unit": "unidad", "egg": "huevo", "leaf": "hoja", "stalk": "tallo",
    "medium": "mediano", "large": "grande", "small": "pequeño",
}


def nombre_porcion(p):
    cantidad = p.get("amount") or p.get("value") or 1
    unidad = (p.get("measureUnit") or {}).get("name") or ""
    mod = (p.get("modifier") or "").strip()
    if unidad in ("undetermined", "RACC", ""):
        texto = mod or p.get("portionDescription") or ""
    else:
        texto = f"{UNIDADES.get(unidad, unidad)} {mod}".strip()
    texto = re.sub(r"\s+", " ", texto).strip(" ,")
    if not texto or texto.lower() == "quantity not specified":
        return None
    # Traduce la primera palabra ("cup, chopped" -> "taza, chopped").
    m = re.match(r"(fl oz|[A-Za-z]+)(.*)", texto)
    if m:
        primera = m.group(1).lower()
        if primera in ("oz", "onza", "lb", "g", "kg"):
            return None  # la app ya tiene g, kg, lb y oz
        texto = UNIDADES.get(primera, m.group(1)) + m.group(2)
    return f"{cantidad:g} {texto}"[:60]


def main(salida, archivos):
    alimentos, porciones = [], []
    for archivo in archivos:
        with open(archivo, encoding="utf-8") as f:
            datos = json.load(f)
        for lista in datos.values():
            for a in lista:
                valores = {}
                for n in a.get("foodNutrients", []):
                    num = (n.get("nutrient") or {}).get("number")
                    if n.get("amount") is not None:
                        valores[num] = n["amount"]
                kcal = next((valores[k] for k in ENERGIA if k in valores), None)
                if kcal is None:
                    continue
                fila = {
                    "fdc_id": a["fdcId"],
                    "tipo": a.get("dataType", ""),
                    "categoria": (a.get("foodCategory") or {}).get("description", ""),
                    "nombre": a["description"].strip()[:200],
                    "calorias": round(kcal, 1),
                }
                for num, campo in CAMPOS.items():
                    fila[campo] = round(max(0.0, valores.get(num, 0.0)), 2)
                alimentos.append(fila)
                vistos = set()
                for p in a.get("foodPortions", []):
                    nombre = nombre_porcion(p)
                    g = p.get("gramWeight")
                    if nombre and g and g > 0 and nombre not in vistos:
                        vistos.add(nombre)
                        porciones.append({"fdc_id": a["fdcId"], "nombre": nombre, "gramos": round(g, 1)})

    for nombre, filas in (("usda.csv", alimentos), ("usda_porciones.csv", porciones)):
        with open(os.path.join(salida, nombre), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(filas[0]))
            w.writeheader()
            w.writerows(filas)
    print(f"{len(alimentos)} alimentos, {len(porciones)} porciones", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
