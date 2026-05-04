"""Compara tipo por tipo entre Notion y Caulky para encontrar la discrepancia."""
import csv, io
from collections import defaultdict

NOTION_CSV = "Movimiento Dinero Guillermo 2024 17eb46879ca98150bacad12dca15e4d8.csv"
CAULKY_CSV = "movimientos (2).csv"

def parse_notion(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    result = []
    for r in csv.DictReader(io.StringIO(text)):
        s = r['Money'].replace('\xa0', '').replace('€', '').replace('€', '').replace(',', '.').strip()
        try:
            m = float(s)
        except:
            continue
        result.append({'name': r['Name'].strip(), 'money': m, 'tipo': r['Tipo Texto'].strip()})
    return result

def parse_caulky(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    result = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            m = float(r['Importe'].strip())
        except:
            continue
        result.append({'name': r['Nombre'].strip(), 'money': m,
                       'tipo': r['Tipo'].strip(), 'grupo': r['Grupo'].strip()})
    return result

notion = parse_notion(NOTION_CSV)
caulky = parse_caulky(CAULKY_CSV)

# Totals by tipo (raw signed)
n_by_tipo = defaultdict(float)
for r in notion:
    n_by_tipo[r['tipo']] += r['money']

c_by_tipo = defaultdict(float)
for r in caulky:
    c_by_tipo[r['tipo']] += r['money']

print("=== COMPARATIVA TIPO POR TIPO (importes raw) ===")
print(f"  {'Tipo':<40} {'Notion':>10} {'Caulky':>10} {'Dif':>10}")
print("  " + "-"*73)

all_tipos = sorted(set(list(n_by_tipo.keys()) + list(c_by_tipo.keys())))
total_n = 0.0
total_c = 0.0
big_diffs = []
for tipo in all_tipos:
    nv = n_by_tipo.get(tipo, 0.0)
    cv = c_by_tipo.get(tipo, 0.0)
    dif = cv - nv
    total_n += nv
    total_c += cv
    marker = " <<<" if abs(dif) > 10 else ""
    if abs(dif) > 10:
        big_diffs.append((tipo, nv, cv, dif))
    print(f"  {tipo:<40} {nv:>10.2f} {cv:>10.2f} {dif:>+10.2f}{marker}")

print("  " + "-"*73)
print(f"  {'TOTAL':<40} {total_n:>10.2f} {total_c:>10.2f} {total_c - total_n:>+10.2f}")

print()
print("=== DIFERENCIAS SIGNIFICATIVAS (>10 EUR) ===")
print(f"  {'Tipo':<40} {'Notion':>10} {'Caulky':>10} {'Dif':>10}")
print("  " + "-"*73)
for tipo, nv, cv, dif in sorted(big_diffs, key=lambda x: abs(x[3]), reverse=True):
    print(f"  {tipo:<40} {nv:>10.2f} {cv:>10.2f} {dif:>+10.2f}")

print()
print("=== INGRESOS: detalle movimientos ===")
INGRESO_TIPOS = {
    'Salario', 'Devoluciones Recibidas', 'Otros Ingresos', 'Regalos Recibidos',
    'Devoluciones Prestamos', 'Devoluciones Préstamos', 'Prestamos Recibidos',
    'Indemnizacion Recibida', 'Intereses A Favor', 'Intereses a Favor',
}
print("  Notion ingresos:")
for r in sorted(notion, key=lambda x: -x['money']):
    if r['tipo'] in INGRESO_TIPOS:
        print(f"    {r['money']:>8.2f}  {r['tipo']:<30}  {r['name']}")

print()
print("  Caulky ingresos (grupo=Ingreso):")
for r in sorted(caulky, key=lambda x: -x['money']):
    if r['grupo'] == 'Ingreso':
        print(f"    {r['money']:>8.2f}  {r['tipo']:<30}  {r['name']}")

# ─── Notion devoluciones préstamos detail ────────────────────────────────────
print()
print("=== Notion - Tipo 'Devoluciones Préstamos' (detalle) ===")
for r in notion:
    if 'Devoluci' in r['tipo'] and 'stamo' in r['tipo']:
        print(f"  {r['money']:>8.2f}  {r['tipo']}  {r['name']}")

# ─── Search for 96.21 in Caulky ──────────────────────────────────────────────
print()
print("=== Buscar 96.21 en Caulky CSV ===")
for r in caulky:
    if abs(abs(r['money']) - 96.21) < 0.01:
        print(f"  money={r['money']:+.2f}  tipo={r['tipo']}  grupo={r['grupo']}  nombre={r['name']}")
if not any(abs(abs(r['money']) - 96.21) < 0.01 for r in caulky):
    print("  (no encontrado)")
