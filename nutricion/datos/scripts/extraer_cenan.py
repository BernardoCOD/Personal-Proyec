"""Extrae las Tablas Peruanas de Composición de Alimentos (CENAN–INS) del PDF a CSV.

Uso:
    pdftotext -layout tpca-2025.pdf tabla.txt
    python3 -I extraer_cenan.py tabla.txt cenan.csv

Toma, por 100 g de parte comestible: energía (kcal), proteínas, grasa total,
carbohidratos totales (incluyen la fibra) y fibra dietaria. "•" (sin dato)
queda vacío.

En el PDF, cuando el nombre no cabe en una línea, la fila de números queda
sin nombre y el nombre se reparte en la línea de arriba y la de abajo.
En otras páginas el código va solo en su línea y el nombre y los números
debajo, hasta el siguiente código.
"""
import csv
import re
import sys

NUM = r"(?:\d+(?:[.,]\d+)?|•)"
NUMEROS = rf"({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})\s+({NUM})(?:\s|$)"
# kcal kJ agua proteínas grasa carbohidratos_totales carbohidratos_disponibles fibra
FILA_CON_NOMBRE = re.compile(rf"^\s*([A-Z]{{1,2}} ?\d{{1,4}})\s+([^\d\s•].*?\S)\s{{2,}}{NUMEROS}")
FILA_SIN_NOMBRE = re.compile(rf"^\s*([A-Z]{{1,2}} ?\d{{1,4}})\s{{2,}}{NUMEROS}")
SOLO_CODIGO = re.compile(r"^\s*([A-Z]{1,2} ?\d{1,4})(?:\s{10,}\1)?\s*$")  # a veces repite el código al final
DATOS = re.compile(rf"^\s*(.*?)\s*{NUMEROS}")
SOLO_TEXTO = re.compile(r"^\s{3,}([^\d\s•<].*?)\s*$")
CODIGO_AL_FINAL = re.compile(r"\s{2,}[A-Z]{1,2} ?\d{1,4}$")
GRUPO = re.compile(r"^\s*([A-Z]) - ([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,()]+?)(?:\s{2,}|$)")
NO_ES_NOMBRE = re.compile(r"TABLAS PERUANAS|Centro Nacional|CÓDIGO|NOMBRE DEL ALIMENTO|INSTITUTO|Energía|Fibra|Grasa|<")


def num(s):
    return None if s == "•" else float(s.replace(",", "."))


def es_texto(lineas, j, filas_idx):
    if not 0 <= j < len(lineas) or j in filas_idx:
        return None
    m = SOLO_TEXTO.match(lineas[j])
    if m and not NO_ES_NOMBRE.search(lineas[j]) and len(lineas[j]) - len(lineas[j].lstrip()) < 20:
        return CODIGO_AL_FINAL.sub("", m.group(1))
    return None


def empieza_nombre(t):
    """True si la línea inicia un nombre (mayúscula, aunque vaya entre comillas)."""
    return t.lstrip('"“(')[:1].isupper()


def completar_nombre(lineas, i, filas_idx, nombre):
    """Une las líneas de texto vecinas que forman parte del nombre.

    Una línea que empieza en mayúscula inicia un nombre; las que empiezan en
    minúscula continúan el nombre anterior.
    """
    arriba = []
    if not nombre or not empieza_nombre(nombre):
        for j in range(i - 1, i - 4, -1):
            t = es_texto(lineas, j, filas_idx)
            if t is None:
                if lineas[j].strip() == "":
                    continue
                break
            arriba.insert(0, t)
            if empieza_nombre(t):
                break
    abajo = []
    for j in range(i + 1, i + 4):
        t = es_texto(lineas, j, filas_idx)
        if t is None:
            if 0 <= j < len(lineas) and lineas[j].strip() == "" and not abajo:
                continue
            break
        if empieza_nombre(t):
            break
        abajo.append(t)
    return " ".join([*arriba, nombre, *abajo]).strip()


def bloque_bajo_codigo(lineas, i, codigos_idx):
    """Nombre y valores de la primera fila de datos bajo un código solo.

    El nombre puede empezar en líneas de texto previas y seguir en una línea
    posterior que empieza en minúscula ("... con papas fritas y" / "arroz").
    """
    partes = []
    for j in range(i + 1, min(i + 8, len(lineas))):
        if j in codigos_idx or NO_ES_NOMBRE.search(lineas[j]):
            return "", None
        if d := DATOS.match(lineas[j]):
            if d.group(1):
                partes.append(d.group(1))
            for k in range(j + 1, min(j + 3, len(lineas))):
                if k in codigos_idx:
                    break
                t = SOLO_TEXTO.match(lineas[k])
                if t and t.group(1)[0].islower():
                    partes.append(t.group(1))
                    break
                if t or DATOS.match(lineas[k]):
                    break
            return " ".join(partes), list(d.groups()[1:])
        if t := SOLO_TEXTO.match(lineas[j]):
            partes.append(CODIGO_AL_FINAL.sub("", t.group(1)))
    return "", None


def main(entrada, salida):
    with open(entrada, encoding="utf-8") as f:
        lineas = f.read().splitlines()
    filas_idx = {i for i, l in enumerate(lineas) if FILA_CON_NOMBRE.match(l) or FILA_SIN_NOMBRE.match(l)}
    codigos_idx = filas_idx | {i for i, l in enumerate(lineas) if SOLO_CODIGO.match(l)}

    filas, grupos, vistos = [], {}, set()
    for i, linea in enumerate(lineas):
        g = GRUPO.match(linea)
        if g:
            grupos[g.group(1)] = g.group(2).strip().capitalize()
        if m := SOLO_CODIGO.match(linea):
            cod = m.group(1)
            nombre, valores = bloque_bajo_codigo(lineas, i, codigos_idx)
            if valores is None:
                continue
        elif m := FILA_CON_NOMBRE.match(linea):
            cod, nombre, *valores = m.groups()
            nombre = completar_nombre(lineas, i, filas_idx, nombre)
        elif m := FILA_SIN_NOMBRE.match(linea):
            cod, *valores = m.groups()
            nombre = completar_nombre(lineas, i, filas_idx, "")
        else:
            continue
        cod = cod.replace(" ", "")
        if cod in vistos or not nombre or cod.startswith("Q"):  # Q: fórmulas infantiles
            continue
        vistos.add(cod)
        kcal, _kj, _agua, prot, grasa, cho_t, _cho_d, fibra = valores
        filas.append({
            "codigo": cod,
            "grupo": grupos.get(cod[0], ""),
            "nombre": re.sub(r"\s+", " ", nombre).strip(" #*"),
            "calorias": num(kcal),
            "proteina_g": num(prot),
            "grasa_g": num(grasa),
            "carbohidratos_g": num(cho_t),
            "fibra_g": num(fibra),
        })

    with open(salida, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    print(f"{len(filas)} alimentos", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
