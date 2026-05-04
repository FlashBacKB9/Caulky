"""
Analiza movimientos (2).csv para encontrar la discrepancia de ~780 euros en De Uso.

Convenio del CSV exportado por Caulky:
  Gasto      → Importe NEGATIVO   → reduce balance
  Devolución → Importe POSITIVO   → suma al balance
  Ingreso    → Importe POSITIVO   → suma al balance

Por tanto: balance_fin = balance_inicial + sum(Importe CSV)
"""
import csv, io
from collections import defaultdict

CSV_PATH = r"movimientos (2).csv"
INITIAL_DE_USO = 2776.62
EXPECTED_END   = 150.86   # saldo De Uso al 31/12/2024 segun Notion

def read_csv(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()
    result = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            importe = float(r['Importe'].strip().replace(',', '.'))
        except:
            continue
        result.append({
            'fecha':   r['Fecha'].strip(),
            'nombre':  r['Nombre'].strip(),
            'tipo':    r['Tipo'].strip(),
            'grupo':   r['Grupo'].strip(),
            'importe': importe,
        })
    return result

mvs = read_csv(CSV_PATH)
print(f"Total movimientos 2024: {len(mvs)}\n")

# 1. Balance total ─────────────────────────────────────────────────────────────
total_neto = sum(m['importe'] for m in mvs)
balance_calc = INITIAL_DE_USO + total_neto
discrepancia = balance_calc - EXPECTED_END

print("=" * 62)
print(f"  Suma neta de todos los importes:     {total_neto:>10.2f} EUR")
print(f"  Balance calculado (inicial + neto):  {balance_calc:>10.2f} EUR")
print(f"  Balance esperado (Notion):           {EXPECTED_END:>10.2f} EUR")
print(f"  DISCREPANCIA:                        {discrepancia:>+10.2f} EUR  ({'exceso gasto' if discrepancia < 0 else 'exceso ingreso'})")

# 2. Por grupo ─────────────────────────────────────────────────────────────────
by_grupo = defaultdict(lambda: {'n': 0, 'total': 0.0})
for m in mvs:
    by_grupo[m['grupo']]['n'] += 1
    by_grupo[m['grupo']]['total'] += m['importe']

print(f"\n{'='*62}")
print(f"  {'Grupo':<15} {'N':>5} {'Total':>12}")
print("  " + "-"*35)
for g, d in sorted(by_grupo.items()):
    print(f"  {g:<15} {d['n']:>5} {d['total']:>12.2f}")

# 3. Ahorro separado ───────────────────────────────────────────────────────────
AHORRO_TIPOS = {"Ahorro", "Ahorro Privado", "Vault de Emergencia"}
ahorro_mvs = [m for m in mvs if m['tipo'] in AHORRO_TIPOS]
otros_mvs  = [m for m in mvs if m['tipo'] not in AHORRO_TIPOS]
ahorro_total = sum(m['importe'] for m in ahorro_mvs)
otros_total  = sum(m['importe'] for m in otros_mvs)

print(f"\n{'='*62}")
print(f"  Mov. tipo Ahorro/* (n={len(ahorro_mvs)}):  total = {ahorro_total:>10.2f} EUR")
print(f"  Resto (n={len(otros_mvs)}):                total = {otros_total:>10.2f} EUR")

print(f"\n  Si los mvs Ahorro NO afectan De Uso:")
bal_sin_ahorro = INITIAL_DE_USO + otros_total
print(f"    balance = {INITIAL_DE_USO:.2f} + {otros_total:.2f} = {bal_sin_ahorro:.2f}  (esperado {EXPECTED_END:.2f})")
print(f"    discrepancia = {bal_sin_ahorro - EXPECTED_END:+.2f} EUR")

# 4. Detalle de devoluciones ───────────────────────────────────────────────────
devs = [m for m in mvs if m['grupo'] == 'Devolución']
devs_total = sum(m['importe'] for m in devs)
print(f"\n{'='*62}")
print(f"  DEVOLUCIONES (n={len(devs)}, total = {devs_total:.2f} EUR):")
for m in sorted(devs, key=lambda x: x['importe'], reverse=True):
    print(f"    [{m['fecha']}] {m['nombre']:<40} {m['importe']:>9.2f}  ({m['tipo']})")

# 5. Ingresos detalle ──────────────────────────────────────────────────────────
ingresos = [m for m in mvs if m['grupo'] == 'Ingreso']
ing_total = sum(m['importe'] for m in ingresos)
print(f"\n{'='*62}")
print(f"  INGRESOS (n={len(ingresos)}, total = {ing_total:.2f} EUR):")
for m in sorted(ingresos, key=lambda x: x['importe'], reverse=True):
    print(f"    [{m['fecha']}] {m['nombre']:<40} {m['importe']:>9.2f}  ({m['tipo']})")

# 6. Top gastos (los que mas reducen el balance) ───────────────────────────────
gastos = [m for m in mvs if m['grupo'] == 'Gasto']
print(f"\n{'='*62}")
print(f"  TOP 30 GASTOS por importe (n total={len(gastos)}):")
for m in sorted(gastos, key=lambda x: x['importe'])[:30]:
    print(f"    [{m['fecha']}] {m['nombre']:<40} {m['importe']:>9.2f}  ({m['tipo']})")

# 7. Movimientos con importe positivo en grupo Gasto (anomalos) ────────────────
anom = [m for m in mvs if m['grupo'] == 'Gasto' and m['importe'] > 0]
print(f"\n{'='*62}")
print(f"  ANOMALOS: Gastos con Importe POSITIVO (deberian ser negativos): n={len(anom)}")
for m in anom:
    print(f"    [{m['fecha']}] {m['nombre']:<40} {m['importe']:>9.2f}  ({m['tipo']})")

# 8. Movimientos con importe negativo en grupo Ingreso/Devolucion (anomalos) ──
anom2 = [m for m in mvs if m['grupo'] in ('Ingreso', 'Devolución') and m['importe'] < 0]
print(f"\n{'='*62}")
print(f"  ANOMALOS: Ingresos/Devoluciones con Importe NEGATIVO: n={len(anom2)}")
for m in anom2:
    print(f"    [{m['fecha']}] {m['nombre']:<40} {m['importe']:>9.2f}  ({m['grupo']} / {m['tipo']})")

# 9. Por tipo, totales ──────────────────────────────────────────────────────────
by_tipo = defaultdict(lambda: {'n': 0, 'total': 0.0})
for m in mvs:
    by_tipo[m['tipo']]['n'] += 1
    by_tipo[m['tipo']]['total'] += m['importe']

print(f"\n{'='*62}")
print(f"  TOTALES POR TIPO (ordenados por impacto en balance):")
print(f"  {'Tipo':<35} {'N':>4} {'Total':>12}")
print("  " + "-"*55)
for tipo, d in sorted(by_tipo.items(), key=lambda x: x[1]['total']):
    print(f"  {tipo:<35} {d['n']:>4} {d['total']:>12.2f}")
