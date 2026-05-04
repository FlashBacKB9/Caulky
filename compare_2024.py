"""Compare Notion vs Caulky 2024 CSV exports to find category discrepancies."""
import csv, io, sys
from collections import defaultdict

def read_notion(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    rows = list(csv.DictReader(io.StringIO(text)))
    result = []
    for r in rows:
        money_str = r['Money'].replace('\xa0', '').replace('â€¬', '').replace('Â', '').replace('€', '').replace(',', '.').strip()
        try:
            money = float(money_str)
        except:
            continue
        result.append({'name': r['Name'].strip(), 'money': money, 'date': r['Date'].strip(), 'tipo': r['Tipo Texto'].strip()})
    return result

def read_caulky(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    rows = list(csv.DictReader(io.StringIO(text)))
    result = []
    for r in rows:
        importe_str = r['Importe'].strip()
        try:
            money = float(importe_str)
        except:
            continue
        result.append({
            'name': r['Nombre'].strip(),
            'money': money,
            'date': r['Fecha'].strip(),
            'tipo': r['Tipo'].strip(),
            'grupo': r['Grupo'].strip(),
        })
    return result

import sys
notion_path = sys.argv[1] if len(sys.argv) > 1 else 'Movimiento Dinero Guillermo 2024 17eb46879ca98150bacad12dca15e4d8.csv'
caulky_path = sys.argv[2] if len(sys.argv) > 2 else 'movimientos (1).csv'
notion = read_notion(notion_path)
caulky = read_caulky(caulky_path)

# Notion totals by category (all amounts are positive in Notion = expenses; negatives = savings withdrawals)
notion_by_cat = defaultdict(float)
for r in notion:
    notion_by_cat[r['tipo']] += r['money']

# Caulky totals by tipo (negative = expense going out, positive devolución = refund)
caulky_by_tipo = defaultdict(float)
caulky_by_grupo = defaultdict(float)
for r in caulky:
    # Normalize: expense = positive value, refund = negative value (to compare with Notion sign convention)
    if r['grupo'] == 'Gasto':
        caulky_by_tipo[r['tipo']] += abs(r['money'])
        caulky_by_grupo[r['grupo']] += abs(r['money'])
    elif r['grupo'] == 'Devolución':
        caulky_by_tipo[r['tipo']] -= abs(r['money'])  # refund reduces total
        caulky_by_grupo['Devolución'] += abs(r['money'])
    else:  # Ingreso
        caulky_by_tipo[r['tipo']] += r['money']

print("=" * 60)
print("NOTION - Totales por categoría (gastos netos)")
print("=" * 60)
for cat, total in sorted(notion_by_cat.items(), key=lambda x: -abs(x[1])):
    print(f"  {cat:<40} {total:>10.2f}")

print()
print("=" * 60)
print("CAULKY - Totales por tipo (gastos netos)")
print("=" * 60)
for tipo, total in sorted(caulky_by_tipo.items(), key=lambda x: -abs(x[1])):
    print(f"  {tipo:<40} {total:>10.2f}")

print()
print("=" * 60)
print("GRUPOS CAULKY (segun screenshots) vs NOTION equivalente")
print("=" * 60)

# Groups from screenshots
CAULKY_GROUPS = {
    "Gasto Casa":      ["Impuestos y Tasa Vivienda", "Muebles y Electrodomésticos", "Comunidad",
                        "Suministros de la Casa", "Mantenimiento Vivienda", "Seguro Hogar",
                        "Móvil", "Otros Casa", "Vivienda"],
    "Entretenimiento": ["Hobbies", "Videojuegos", "Otros Entretenimiento", "Espectáculo (Cine/Teatro)",
                        "PC", "Libros", "Capricho", "Pintura"],
    "Vida Diaria":     ["Comida Fuera", "Comida Diaria", "Gas", "Electrónica", "Accesorios",
                        "Otros Vida Diaria", "Ropa", "Luz", "Internet"],
    "Regalos":         ["Regalos Hechos", "Préstamo Hecho", "Donaciones"],
    "Transporte":      ["Otros Transporte", "Taxi", "Bus", "Tren"],
    "Salud":           ["Dentista", "Gimnasio", "Psicólogo", "Medicinas"],
    "Moto/Coche":      ["Gasolina", "Seguro", "Reparaciones", "Mantenimiento"],
    "Vacaciones":      ["Entretenimiento", "Comida", "Viaje", "Alquiler Coche", "Alojamiento", "Otros Vacaciones"],
    "Suscripciones":   ["Netflix", "Google One", "Notion", "Spotify", "Amazon Prime", "HBO", "Costco"],
    "Ingreso":         ["Salario", "Devoluciones Recibidas", "Otros Ingresos", "Regalos Recibidos",
                        "Devoluciones Préstamos", "Préstamos Recibidos", "Indemnización Recibida",
                        "Intereses A Favor"],
    "Ahorro":          ["Ahorro", "Vault de Emergencia", "Ahorro Privado"],
}

# Notion categories that map to each Caulky group (what user would sum in Notion)
NOTION_EQUIV = {
    "Gasto Casa":      ["Casa Nueva", "Otros Casa", "Muebles y Electrodomésticos", "Suministros de la Casa"],
    "Entretenimiento": ["Hobbies", "Videojuegos", "Otros Entretenimiento", "Espectáculo (Cine/Teatro)",
                        "PC", "Libros", "Capricho"],
    "Vida Diaria":     ["Comida Fuera", "Comida Diaria", "Otros Vida Diaria", "Ropa",
                        "Gastos Compartidos", "Boda"],
    "Regalos":         ["Regalos Hechos", "Préstamo Hecho", "Devoluciones Préstamos"],
    "Transporte":      ["Otros Transporte", "Bus/Taxi/Tren"],
    "Salud":           ["Gimnasio", "Medicinas"],
    "Moto/Coche":      ["Gasolina", "Seguro", "Reparaciones"],
    "Vacaciones":      ["Entretenimiento", "Comida", "Viaje"],
    "Suscripciones":   ["Netflix", "Google One"],
    "Ingreso":         ["Salario", "Devoluciones Recibidas", "Otros Ingresos", "Regalos Recibidos",
                        "Devoluciones Préstamos"],
    "Ahorro":          ["Ahorro"],
}

print(f"\n  {'Grupo':<18} {'Caulky (neto)':>15} {'Notion (bruto)':>15} {'Dif':>10}")
print("  " + "-"*62)
for group, tipos in CAULKY_GROUPS.items():
    c_total = sum(caulky_by_tipo.get(t, 0) for t in tipos)
    n_total = sum(notion_by_cat.get(c, 0) for c in NOTION_EQUIV.get(group, []))
    diff = c_total - n_total
    marker = " <--" if abs(diff) > 30 else ""
    print(f"  {group:<18} {c_total:>15.2f} {n_total:>15.2f} {diff:>+10.2f}{marker}")

print()
print("NOTA: Notion (bruto) suma devoluciones como gasto (+), Caulky las resta (-).")
print("Por eso Caulky siempre deberia ser MENOR. Si es mayor, hay entradas extra en Caulky.")

print()
print("=" * 60)
print("DEVOLUCION EN CAULKY (reducen el total de su tipo)")
print("=" * 60)
for r in caulky:
    if r['grupo'] == 'Devolución':
        print(f"  [{r['date']}] {r['name']:<40} -{abs(r['money']):>8.2f}  ({r['tipo']})")

print()
print("=" * 60)
print("DIFERENCIAS CLAVE POR TIPO (Notion suma devolucion como gasto, Caulky la resta)")
print("=" * 60)
# Find tipos where there are devoluciones
devolucion_by_tipo = defaultdict(float)
for r in caulky:
    if r['grupo'] == 'Devolución':
        devolucion_by_tipo[r['tipo']] += abs(r['money'])

print(f"\n  {'Tipo':<35} {'Dev. en Caulky':>15} {'Impacto (2x)':>12}")
print("  " + "-"*65)
for tipo, dev in sorted(devolucion_by_tipo.items(), key=lambda x: -x[1]):
    print(f"  {tipo:<35} {dev:>15.2f} {2*dev:>+12.2f}")
