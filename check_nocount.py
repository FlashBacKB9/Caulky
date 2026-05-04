import csv, io

with open("movimientos (2).csv", encoding="utf-8-sig", errors="replace") as f:
    text = f.read()

rows = list(csv.DictReader(io.StringIO(text)))

vals = set(r["No contar"].strip() for r in rows)
print("Valores 'No contar':", vals)

no_count = [r for r in rows if r["No contar"].strip() in ("Si", "Sí", "Yes", "1", "True")]
print(f"No contar = Si: {len(no_count)}")
for r in no_count:
    try:
        m = float(r["Importe"])
    except:
        m = 0.0
    print(f"  {r['Fecha']}  {m:>10.2f}  {r['Grupo']:<12} {r['Tipo']:<25}  {r['Nombre']}")

no_count_total = sum(float(r["Importe"]) for r in no_count)
print(f"  TOTAL no_count: {no_count_total:.2f}")

# Also check Pagado
vals_p = set(r["Pagado"].strip() for r in rows)
print()
print("Valores 'Pagado':", vals_p)
unpaid = [r for r in rows if r["Pagado"].strip() not in ("Si", "Sí", "Yes", "1", "True")]
print(f"Pagado != Si: {len(unpaid)}")
for r in unpaid:
    try:
        m = float(r["Importe"])
    except:
        m = 0.0
    print(f"  {r['Fecha']}  {m:>10.2f}  {r['Grupo']:<12} {r['Tipo']:<25}  {r['Nombre']}")
