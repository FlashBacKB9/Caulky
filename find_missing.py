"""Encuentra movimientos de Notion sin match en Caulky (y viceversa)."""
import csv, io
from collections import defaultdict

NOTION_CSV = "Movimiento Dinero Guillermo 2024 17eb46879ca98150bacad12dca15e4d8.csv"
CAULKY_CSV = "movimientos (2).csv"

def parse_notion(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    result = []
    for r in csv.DictReader(io.StringIO(text)):
        s = r['Money'].replace('\xa0','').replace('€','').replace(',','.').strip()
        try:
            m = round(float(s), 2)
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
            m = round(float(r['Importe'].strip()), 2)
        except:
            continue
        result.append({'name': r['Nombre'].strip(), 'money': m,
                       'tipo': r['Tipo'].strip(), 'grupo': r['Grupo'].strip()})
    return result

notion = parse_notion(NOTION_CSV)
caulky = parse_caulky(CAULKY_CSV)

print(f"Notion: {len(notion)} movimientos")
print(f"Caulky: {len(caulky)} movimientos")

# Build frequency maps by (name_lower, abs_amount)
def key(name, money):
    return (name.lower().strip(), abs(round(money, 2)))

notion_pool = defaultdict(list)
for r in notion:
    notion_pool[key(r['name'], r['money'])].append(r)

caulky_pool = defaultdict(list)
for r in caulky:
    caulky_pool[key(r['name'], r['money'])].append(r)

# Find Notion entries with no Caulky match
unmatched_notion = []
for k, items in notion_pool.items():
    n_count = len(items)
    c_count = len(caulky_pool.get(k, []))
    excess = n_count - c_count
    if excess > 0:
        for item in items[:excess]:
            unmatched_notion.append(item)

# Find Caulky entries with no Notion match
unmatched_caulky = []
for k, items in caulky_pool.items():
    c_count = len(items)
    n_count = len(notion_pool.get(k, []))
    excess = c_count - n_count
    if excess > 0:
        for item in items[:excess]:
            unmatched_caulky.append(item)

print()
print("=== En NOTION pero NO en Caulky (por nombre+importe) ===")
total_n = 0.0
for r in sorted(unmatched_notion, key=lambda x: -abs(x['money'])):
    print(f"  {r['money']:>9.2f}  {r['tipo']:<30}  {r['name']}")
    total_n += r['money']
print(f"  TOTAL: {total_n:.2f}")

print()
print("=== En CAULKY pero NO en Notion (por nombre+importe) ===")
total_c = 0.0
for r in sorted(unmatched_caulky, key=lambda x: x['money']):
    print(f"  {r['money']:>9.2f}  {r['grupo']:<12} {r['tipo']:<25}  {r['name']}")
    total_c += r['money']
print(f"  TOTAL: {total_c:.2f}")

print()
print("=== Impacto en balance de De Uso ===")
# Notion unmatched: these amounts should be in Caulky but aren't (or wrong sign)
# Caulky unmatched: these are in Caulky but not in Notion
print(f"  Notion unmatched (missing income or wrong sign): {total_n:.2f}")
print(f"  Caulky unmatched (extra expense): {total_c:.2f}")
print()
# Balance impact: for each Notion unmatched (income type or expense type):
ing_tipos = {'Salario','Devoluciones Recibidas','Otros Ingresos','Regalos Recibidos',
             'Devoluciones Prestamos','Devoluciones Préstamos','Prestamos Recibidos','Intereses A Favor'}
n_impact = 0.0
for r in unmatched_notion:
    if r['tipo'] in ing_tipos:
        n_impact += r['money']  # missing income = balance lower
    else:
        n_impact -= r['money']  # missing expense = balance higher (less deducted)

c_impact = total_c  # all Caulky unmatched = reduce balance (mostly negative)
print(f"  Missing Notion income impact on balance: {n_impact:+.2f}")
print(f"  Extra Caulky movements impact: {c_impact:+.2f}")
print(f"  Combined: {n_impact + c_impact:+.2f}")
print(f"  Known discrepancy: -786.79")
