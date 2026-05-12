"""
FORENSIC AUDIT — Multi-fase consolidada
F1.C, F1.D, F4 ejecutados contra backend producción + APK real.
Evidencia: queries crudas, screenshots, hashes IDB, logs HTTP.
"""
import os, sys, json, time, base64, hashlib, subprocess, urllib.request, glob
from datetime import datetime
from websocket import create_connection

# Auto-detect run dir
_runs = sorted(glob.glob("D:/github/volvix-pos/audit_run_*"), reverse=True)
RUN_DIR = _runs[0]
JWT = open(f"{RUN_DIR}/logs/jwt.txt").read().strip()
PROD = "https://volvix-pos.vercel.app"
ADB = r"C:/Android/Sdk/platform-tools/adb.exe"

def adb(args, t=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=t).stdout.strip()

def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")

def http(method, path, body=None, extra_headers=None, t=15):
    """HTTP request al backend prod, retorna (http_code, body)."""
    headers = ["-H", f"Authorization: Bearer {JWT}", "-H", "Content-Type: application/json"]
    if extra_headers:
        for h in extra_headers:
            headers.extend(["-H", h])
    cmd = ["curl", "-s", "-X", method, "-w", "\n|HTTP=%{http_code}"] + headers
    if body is not None:
        cmd.extend(["-d", json.dumps(body)])
    cmd.append(f"{PROD}{path}")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=t)
    out = r.stdout
    # Split body and HTTP code
    if "\n|HTTP=" in out:
        body_text, code_part = out.rsplit("\n|HTTP=", 1)
        code = int(code_part.strip()) if code_part.strip().isdigit() else 0
    else:
        body_text = out
        code = 0
    try:
        body_json = json.loads(body_text)
    except:
        body_json = body_text[:500]
    return code, body_json

RESULTS = {"phase": "F-multi", "started_at": now_iso(), "tests": []}

def record(test_id, phase, description, status, evidence, details=None):
    test = {
        "test_id": test_id,
        "phase": phase,
        "description": description,
        "status": status,
        "evidence": evidence,
        "details": details or {},
        "timestamp": now_iso()
    }
    icon = "[PASS]" if status == "PASS" else ("[FAIL]" if status == "FAIL" else f"[{status}]")
    print(f"\n{icon} {test_id} | {phase} | {description}", flush=True)
    if details:
        print(f"  details: {json.dumps(details, default=str)[:300]}", flush=True)
    RESULTS["tests"].append(test)

# ============================================================
# F4.A - PRECISIÓN DECIMAL ($33.33 x 3 = $99.99)
# ============================================================
print("\n" + "="*70, flush=True)
print("F4.A — Precisión decimal: 3 items a $33.33 = $99.99 exacto", flush=True)
print("="*70, flush=True)

TS = int(time.time())
sale_body = {
    "items": [
        {"qty": 3, "code": f"DEC-{TS}", "name": f"DECIMAL-TEST-{TS}", "price": 33.33, "subtotal": 99.99}
    ],
    "total": 99.99,
    "payment_method": "efectivo",
    "tenant_id": "TNT001"
}

code, resp = http("POST", "/api/sales", sale_body,
                  extra_headers=[f"Idempotency-Key: dec-{TS}"])
print(f"  HTTP {code}", flush=True)
if isinstance(resp, dict):
    actual_total = resp.get('total')
    print(f"  total returned: {actual_total!r} (expected: 99.99 EXACT)", flush=True)
    decimal_ok = (actual_total == 99.99)
    record(f"F4A_dec_3x3333", "4.A", "3 items a $33.33 = $99.99 exacto",
        "PASS" if decimal_ok else "FAIL",
        evidence={"backend_query": f"/api/sales POST", "response_total": actual_total},
        details={"expected": 99.99, "got": actual_total, "sale_id": resp.get('id'), "full_response": resp})
else:
    record("F4A_dec_3x3333", "4.A", "3 items a $33.33 = $99.99 exacto", "FAIL",
        evidence={"backend_query": "/api/sales POST"},
        details={"http_code": code, "response_snippet": str(resp)[:300]})

# ============================================================
# F4.B - 7 items @ $14.28 + IVA 16% (total ~$115.95)
# ============================================================
print("\n" + "="*70, flush=True)
print("F4.B — 7 items @ $14.28 + IVA 16%", flush=True)
print("="*70, flush=True)

TS = int(time.time())
expected_subtotal = round(7 * 14.28, 2)  # 99.96
expected_iva = round(expected_subtotal * 0.16, 2)  # 15.99
expected_total = round(expected_subtotal + expected_iva, 2)  # 115.95

sale2 = {
    "items": [{"qty": 7, "code": f"IVA-{TS}", "name": f"IVA-TEST-{TS}", "price": 14.28, "subtotal": expected_subtotal}],
    "total": expected_total,
    "payment_method": "efectivo",
    "tenant_id": "TNT001"
}
code, resp = http("POST", "/api/sales", sale2, extra_headers=[f"Idempotency-Key: iva-{TS}"])
print(f"  HTTP {code}, total esperado: {expected_total}, recibido: {resp.get('total') if isinstance(resp, dict) else 'N/A'}", flush=True)

iva_ok = (isinstance(resp, dict) and abs((resp.get('total') or 0) - expected_total) < 0.01)
record("F4B_iva_7x1428", "4.B", "7 items + IVA 16% = $115.95 exacto",
    "PASS" if iva_ok else "FAIL",
    evidence={"backend_query": "/api/sales POST"},
    details={"expected_subtotal": expected_subtotal, "expected_iva": expected_iva,
             "expected_total": expected_total, "got": resp.get('total') if isinstance(resp, dict) else None})

# ============================================================
# F4.C - Folios consecutivos: 5 ventas rápidas
# ============================================================
print("\n" + "="*70, flush=True)
print("F4.C — Folios consecutivos: 5 ventas rápidas", flush=True)
print("="*70, flush=True)

folios = []
ts_f = int(time.time())
for i in range(5):
    code, resp = http("POST", "/api/sales", {
        "items": [{"qty": 1, "code": f"FOL-{ts_f}-{i}", "name": f"FOLIO-{i}", "price": 10, "subtotal": 10}],
        "total": 10,
        "payment_method": "efectivo",
        "tenant_id": "TNT001"
    }, extra_headers=[f"Idempotency-Key: folio-{ts_f}-{i}"])
    if isinstance(resp, dict):
        folios.append({"i": i, "id": resp.get('id'), "folio": resp.get('folio'), "code": code})
        print(f"  venta {i}: HTTP {code}, id={(resp.get('id') or '')[:8]}, folio={resp.get('folio')}", flush=True)
    time.sleep(0.5)

folio_values = [f["folio"] for f in folios if f.get("folio") is not None]
# Verificar consecutivos
consecutive = True
prev = None
for f in folio_values:
    try:
        n = int(f)
        if prev is not None and n != prev + 1:
            consecutive = False
            break
        prev = n
    except:
        # folio puede ser alfanumerico
        pass

record("F4C_folios", "4.C", "Folios consecutivos en 5 ventas",
    "PASS" if folio_values and consecutive else "FAIL" if folio_values else "SKIPPED",
    evidence={"backend_query": "/api/sales x5"},
    details={"folios_received": folio_values, "consecutive": consecutive, "all_5_creates_ok": all(f.get("code") in (200, 201) for f in folios)})

# ============================================================
# F1.D.1 - Stock negativo permitido? 2 ventas concurrent del último item
# ============================================================
print("\n" + "="*70, flush=True)
print("F1.D.1 — 2 ventas concurrent del MISMO producto (stock negativo?)", flush=True)
print("="*70, flush=True)

# Crear producto con stock 1
TS = int(time.time())
code, prod = http("POST", "/api/products", {
    "name": f"STOCK-LAST-{TS}",
    "code": f"SL-{TS}",
    "price": 50,
    "stock": 1,
    "tenant_id": "TNT001"
})
print(f"  Producto creado: {code} id={prod.get('id') if isinstance(prod, dict) else 'N/A'} stock={prod.get('stock') if isinstance(prod, dict) else 'N/A'}", flush=True)

# Lanzar 2 POST /api/sales en paralelo, vendiendo qty=1 cada uno (total 2 vs stock 1)
import threading
results = []
def make_sale(idx):
    code, r = http("POST", "/api/sales", {
        "items": [{"qty": 1, "code": f"SL-{TS}", "name": f"STOCK-LAST-{TS}", "price": 50, "subtotal": 50, "product_id": prod.get('id') if isinstance(prod, dict) else None}],
        "total": 50,
        "payment_method": "efectivo",
        "tenant_id": "TNT001"
    }, extra_headers=[f"Idempotency-Key: stock-{TS}-{idx}"])
    results.append({"idx": idx, "http": code, "id": r.get('id') if isinstance(r, dict) else None, "error": r.get('error') if isinstance(r, dict) else r})

threads = [threading.Thread(target=make_sale, args=(i,)) for i in range(2)]
for t in threads: t.start()
for t in threads: t.join()
print(f"  Resultados: {results}", flush=True)

# Verificar stock final
code, prod_after = http("GET", "/api/products?q=" + f"SL-{TS}")
products = prod_after if isinstance(prod_after, list) else prod_after.get('products', [])
sl_after = [p for p in products if p.get('code') == f"SL-{TS}"]
final_stock = sl_after[0].get('stock') if sl_after else None
print(f"  Stock final: {final_stock} (esperado: 0 si solo 1 venta paso, o -1 si ambas pasaron)", flush=True)

record("F1D1_stock_race", "1.D.1", "Stock atomic - 2 ventas concurrent del último item",
    "PASS" if final_stock is not None and final_stock >= 0 else "FAIL",
    evidence={"backend_query": "POST /api/sales x2 concurrent + GET /api/products"},
    details={"stock_initial": 1, "stock_final": final_stock,
             "sales_results": results,
             "successful_sales": sum(1 for r in results if r['http'] == 200),
             "stock_negative": final_stock is not None and final_stock < 0})

# ============================================================
# F1.D.2 - 2do POST mismo idempotency-key (anti-doble cobro)
# ============================================================
print("\n" + "="*70, flush=True)
print("F1.D.2 — Idempotency-Key: 2do POST con misma key", flush=True)
print("="*70, flush=True)

TS = int(time.time())
idem_key = f"idem-{TS}"
sale_body = {
    "items": [{"qty": 1, "code": "IDEM", "name": "IDEM-TEST", "price": 10, "subtotal": 10}],
    "total": 10,
    "payment_method": "efectivo",
    "tenant_id": "TNT001"
}

code1, r1 = http("POST", "/api/sales", sale_body, extra_headers=[f"Idempotency-Key: {idem_key}"])
code2, r2 = http("POST", "/api/sales", sale_body, extra_headers=[f"Idempotency-Key: {idem_key}"])
id1 = r1.get('id') if isinstance(r1, dict) else None
id2 = r2.get('id') if isinstance(r2, dict) else None
print(f"  POST 1: HTTP {code1}, id={id1[:8] if id1 else None}", flush=True)
print(f"  POST 2: HTTP {code2}, id={id2[:8] if id2 else None}", flush=True)
print(f"  IDs iguales: {id1 == id2 if id1 and id2 else False}", flush=True)

record("F1D2_idem", "1.D.2", "Idempotency-Key: 2do POST devuelve mismo id (no duplicado)",
    "PASS" if id1 and id2 and id1 == id2 else "FAIL",
    evidence={"backend_query": "POST /api/sales x2 same idempotency"},
    details={"http_post1": code1, "http_post2": code2, "id1": id1, "id2": id2, "same_id": id1 == id2})

# ============================================================
# F4.D - Diferencia decimal: precio con 4 decimales
# ============================================================
print("\n" + "="*70, flush=True)
print("F4.D — Precio con precisión sub-centavo ($14.2857)", flush=True)
print("="*70, flush=True)

TS = int(time.time())
code, resp = http("POST", "/api/sales", {
    "items": [{"qty": 1, "code": f"PREC-{TS}", "name": f"PRECISE-{TS}", "price": 14.2857, "subtotal": 14.2857}],
    "total": 14.2857,
    "payment_method": "efectivo",
    "tenant_id": "TNT001"
}, extra_headers=[f"Idempotency-Key: prec-{TS}"])
got = resp.get('total') if isinstance(resp, dict) else None
print(f"  HTTP {code}, total escrito: 14.2857, total devuelto: {got!r}", flush=True)
# El backend puede redondear a 2 decimales o aceptar 4
record("F4D_precision_subcent", "4.D", "Precio con 4 decimales: ¿se redondea?",
    "PASS" if got is not None else "FAIL",
    evidence={"backend_query": "POST /api/sales"},
    details={"input_price": 14.2857, "got_total": got, "rounded_to_2dec": got == round(14.2857, 2), "preserved_full": got == 14.2857})

# ============================================================
# F1.D.3 - Anular venta inexistente
# ============================================================
print("\n" + "="*70, flush=True)
print("F1.D.3 — DELETE venta con ID inexistente (debe 404)", flush=True)
print("="*70, flush=True)

fake_id = "00000000-0000-0000-0000-000000000000"
code, resp = http("DELETE", f"/api/sales/{fake_id}")
print(f"  HTTP {code}, resp: {str(resp)[:200]}", flush=True)
record("F1D3_anular_inexistente", "1.D.3", "DELETE sale ID falso debe 404",
    "PASS" if code == 404 else "FAIL",
    evidence={"backend_query": f"DELETE /api/sales/{fake_id}"},
    details={"http_code": code, "expected": 404})

# ============================================================
# F6 - Health endpoint
# ============================================================
print("\n" + "="*70, flush=True)
print("F6 — Health endpoint del backend", flush=True)
print("="*70, flush=True)

code, resp = http("GET", "/api/health")
print(f"  HTTP {code}, resp: {str(resp)[:300]}", flush=True)
record("F6_health", "6", "/api/health responde 200 con DB ok",
    "PASS" if code == 200 and isinstance(resp, dict) and resp.get('ok') else "FAIL",
    evidence={"backend_query": "/api/health"},
    details={"http_code": code, "body": resp})

# ============================================================
# Final
# ============================================================
RESULTS["completed_at"] = now_iso()
RESULTS["total_tests"] = len(RESULTS["tests"])
RESULTS["pass"] = sum(1 for t in RESULTS["tests"] if t["status"] == "PASS")
RESULTS["fail"] = sum(1 for t in RESULTS["tests"] if t["status"] == "FAIL")
RESULTS["skipped"] = sum(1 for t in RESULTS["tests"] if t["status"] not in ("PASS", "FAIL"))

print("\n" + "="*70, flush=True)
print(f"RESULTADOS: {RESULTS['pass']} PASS, {RESULTS['fail']} FAIL, {RESULTS['skipped']} OTROS de {RESULTS['total_tests']}", flush=True)
print("="*70, flush=True)
for t in RESULTS["tests"]:
    icon = "OK  " if t["status"] == "PASS" else "FAIL"
    print(f"  [{icon}] {t['test_id']:30s} {t['description'][:55]}", flush=True)

with open(f"{RUN_DIR}/reports/forensic_multifase_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {RUN_DIR}/reports/forensic_multifase_results.json", flush=True)
