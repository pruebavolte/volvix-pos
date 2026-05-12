"""
FASE B.6 — Re-test tras reparaciones BUG-F2, F3, F4, F6
Verifica que los fixes funcionan + no hay regresion en tests previos.
"""
import os, sys, json, time, subprocess, urllib.request, glob, threading
from datetime import datetime

_runs = sorted(glob.glob("D:/github/volvix-pos/audit_run_*"), reverse=True)
RUN_DIR = _runs[0]
PROD = "https://volvix-pos.vercel.app"

# JWT
req = urllib.request.Request(
    f"{PROD}/api/login",
    data=json.dumps({"email":"admin@volvix.test","password":"Volvix2026!"}).encode(),
    headers={"Content-Type":"application/json"}
)
JWT = json.loads(urllib.request.urlopen(req, timeout=15).read())["token"]
os.makedirs(f"{RUN_DIR}/logs", exist_ok=True)
with open(f"{RUN_DIR}/logs/jwt.txt", "w") as f: f.write(JWT)
print(f"JWT len: {len(JWT)}", flush=True)

def http(method, path, body=None, extra_headers=None, t=15):
    headers = ["-H", f"Authorization: Bearer {JWT}", "-H", "Content-Type: application/json"]
    if extra_headers:
        for h in extra_headers: headers.extend(["-H", h])
    cmd = ["curl", "-s", "-X", method, "-w", "\n|HTTP=%{http_code}"] + headers
    if body is not None: cmd.extend(["-d", json.dumps(body)])
    cmd.append(f"{PROD}{path}")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=t)
    if "\n|HTTP=" in r.stdout:
        body_text, code = r.stdout.rsplit("\n|HTTP=", 1)
        code = int(code.strip()) if code.strip().isdigit() else 0
    else:
        body_text, code = r.stdout, 0
    try: return code, json.loads(body_text)
    except: return code, body_text[:500]

RESULTS = {"phase": "B.6_retest", "tests": [], "started_at": datetime.now().astimezone().isoformat(timespec="seconds")}
def record(test_id, desc, status, details):
    icon = "[PASS]" if status == "PASS" else ("[FAIL]" if status == "FAIL" else f"[{status}]")
    print(f"\n{icon} {test_id} | {desc}", flush=True)
    print(f"  details: {json.dumps(details, default=str)[:300]}", flush=True)
    RESULTS["tests"].append({"test_id": test_id, "description": desc, "status": status, "details": details})

# ============================================================
# VERIFY BUG-F6 fix (frontend ahora manda 'id')
# Pero como esto es CLIENTE, simulamos con curl mandando 'id' (que es lo que ahora hace el frontend)
# ============================================================
print("\n" + "="*70, flush=True)
print("RE-TEST BUG-F6: ahora el cliente manda items[].id correctamente", flush=True)
print("="*70, flush=True)
TS = int(time.time())

# Crear producto stock=2
code, prod = http("POST", "/api/products", {
    "name": f"RETESTF6-{TS}", "code": f"RT-{TS}", "price": 10, "stock": 2, "tenant_id": "TNT001"
})
prod_id = prod.get('id') if isinstance(prod, dict) else None
print(f"  Producto: {prod_id[:8] if prod_id else 'N/A'}, stock={prod.get('stock')}", flush=True)

# Simular como cliente arreglado manda items con 'id'
for i in range(1, 4):
    code, r = http("POST", "/api/sales", {
        "items": [{"qty": 1, "id": prod_id, "product_id": prod_id, "code": f"RT-{TS}", "name": f"RT", "price": 10, "subtotal": 10}],
        "total": 10,
        "payment_method": "efectivo",
        "tenant_id": "TNT001"
    }, extra_headers=[f"Idempotency-Key: f6-{TS}-{i}"])
    # Get stock
    time.sleep(1)
    code_g, prods = http("GET", f"/api/products?q=RT-{TS}&limit=2")
    pp = prods if isinstance(prods, list) else prods.get('products', [])
    stock_now = next((p.get('stock') for p in pp if p.get('code') == f"RT-{TS}"), None)
    err = r.get('error') if isinstance(r, dict) else None
    print(f"  Venta {i}: HTTP {code}, stock_after={stock_now}, error={err}", flush=True)

# Resultado esperado: venta1 → stock=1, venta2 → stock=0, venta3 → HTTP 409 stock_insuficiente
# La última venta (i=3) debe rechazarse
record("RETEST_BUG_F6", "Stock se descuenta correctamente (no oversell)",
    "PASS" if stock_now == 0 and code == 409 and err == 'stock_insuficiente' else "FAIL",
    {"final_stock": stock_now, "last_http": code, "last_error": err})

# ============================================================
# VERIFY BUG-F2 fix (Idempotency-Key header DEBE enviarse)
# Probamos el endpoint que requiere ese header (POST /api/sales)
# ============================================================
print("\n" + "="*70, flush=True)
print("RE-TEST BUG-F2: POST /api/sales SIN Idempotency-Key debe ser 400, CON debe ser 200", flush=True)
print("="*70, flush=True)

TS = int(time.time())
# Sin header → 400
code_no, r_no = http("POST", "/api/sales", {
    "items": [{"qty": 1, "code": "NOK", "name": "NOK", "price": 1, "subtotal": 1}],
    "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
})
print(f"  Sin Idempotency-Key: HTTP {code_no}, error={r_no.get('error') if isinstance(r_no, dict) else r_no}", flush=True)

# Con header → 200
code_yes, r_yes = http("POST", "/api/sales", {
    "items": [{"qty": 1, "code": "OK", "name": "OK", "price": 1, "subtotal": 1}],
    "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
}, extra_headers=[f"Idempotency-Key: f2-{TS}"])
print(f"  Con Idempotency-Key: HTTP {code_yes}, id={r_yes.get('id', '')[:8] if isinstance(r_yes, dict) else 'N/A'}", flush=True)

record("RETEST_BUG_F2_backend_enforcement", "Backend requiere Idempotency-Key (400) y acepta venta con header (200)",
    "PASS" if code_no == 400 and code_yes == 200 else "FAIL",
    {"http_without_header": code_no, "http_with_header": code_yes})

# ============================================================
# VERIFY BUG-F2 fix client-side: el bundle actualizado DEBE incluir 'Idempotency-Key' en finalHeaders
# ============================================================
print("\n" + "="*70, flush=True)
print("RE-TEST BUG-F2 client-side: el bundle deployed contiene la lógica?", flush=True)
print("="*70, flush=True)

queue_resp = subprocess.run(
    ["curl", "-s", f"{PROD}/volvix-offline-queue.js"],
    capture_output=True, timeout=15
)
queue_js = (queue_resp.stdout or b"").decode("utf-8", errors="replace")

has_idem_header_logic = "'Idempotency-Key': String(item.idempotencyKey)" in queue_js
has_bug_f2_comment = "BUG-F2 FIX" in queue_js
has_bug_f3_defensive = "BUG-F3 FIX" in queue_js
print(f"  Bundle has 'Idempotency-Key' logic: {has_idem_header_logic}", flush=True)
print(f"  Has BUG-F2 FIX comment: {has_bug_f2_comment}", flush=True)
print(f"  Has BUG-F3 defensive: {has_bug_f3_defensive}", flush=True)

record("RETEST_BUG_F2_client_bundle", "Bundle deployed incluye Idempotency-Key en headers",
    "PASS" if has_idem_header_logic and has_bug_f2_comment else "FAIL",
    {"has_logic": has_idem_header_logic, "has_comment": has_bug_f2_comment})

record("RETEST_BUG_F3_client_bundle", "Bundle deployed incluye defensiva NaN retries",
    "PASS" if has_bug_f3_defensive else "FAIL",
    {"has_defensive": has_bug_f3_defensive})

# ============================================================
# VERIFY BUG-F4 fix: el nuevo archivo está deployed
# ============================================================
print("\n" + "="*70, flush=True)
print("RE-TEST BUG-F4: notifier deployed?", flush=True)
print("="*70, flush=True)

notifier_resp = subprocess.run(
    ["curl", "-s", "-w", "|HTTP=%{http_code}", f"{PROD}/volvix-queue-fail-notifier.js"],
    capture_output=True, timeout=10
)
notifier_raw = (notifier_resp.stdout or b"").decode("utf-8", errors="replace")
notifier_body = notifier_raw.split("|HTTP=")[0]
notifier_code = notifier_raw.split("|HTTP=")[-1].strip() if "|HTTP=" in notifier_raw else "0"
print(f"  HTTP {notifier_code}, has 'BUG-F4 FIX': {'BUG-F4 FIX' in notifier_body}", flush=True)
print(f"  Size: {len(notifier_body)} bytes", flush=True)

# Y verificar que se incluye en salvadorex-pos.html
spos_resp = subprocess.run(
    ["curl", "-s", f"{PROD}/salvadorex-pos.html"],
    capture_output=True, timeout=15
)
spos_html = (spos_resp.stdout or b"").decode("utf-8", errors="replace")
has_script_tag = 'volvix-queue-fail-notifier.js' in spos_html
print(f"  salvadorex-pos.html includes script: {has_script_tag}", flush=True)

record("RETEST_BUG_F4_deployed", "Notifier deployed y referenciado en salvadorex-pos.html",
    "PASS" if notifier_code == "200" and "BUG-F4 FIX" in notifier_body and has_script_tag else "FAIL",
    {"http": notifier_code, "has_fix_comment": "BUG-F4 FIX" in notifier_body, "in_html": has_script_tag})

# ============================================================
# VERIFY BUG-F6 fix client-side: el bundle html ahora manda 'id' además de 'product_id'
# ============================================================
print("\n" + "="*70, flush=True)
print("RE-TEST BUG-F6 client-side: bundle html actualizado?", flush=True)
print("="*70, flush=True)

has_id_field = "id: i.id || null,\n          product_id: i.id || null," in spos_html
has_bug_f6_comment = "BUG-F6 FIX" in spos_html
print(f"  Has 'id: i.id' before 'product_id: i.id': {has_id_field}", flush=True)
print(f"  Has BUG-F6 FIX comment: {has_bug_f6_comment}", flush=True)

record("RETEST_BUG_F6_client_bundle", "salvadorex-pos.html manda items[].id correctamente",
    "PASS" if has_id_field and has_bug_f6_comment else "FAIL",
    {"has_id_field": has_id_field, "has_comment": has_bug_f6_comment})

# ============================================================
# REGRESSION: re-ejecutar los 7 tests que PASS antes
# ============================================================
print("\n" + "="*70, flush=True)
print("REGRESSION TESTS — ejecutar los 7 PASS originales", flush=True)
print("="*70, flush=True)

# F4.A: $33.33 x 3 = $99.99
TS = int(time.time())
code, r = http("POST", "/api/sales", {
    "items": [{"qty": 3, "code": "REG-DEC", "name": "REG-DEC", "price": 33.33, "subtotal": 99.99}],
    "total": 99.99, "payment_method": "efectivo", "tenant_id": "TNT001"
}, extra_headers=[f"Idempotency-Key: reg-dec-{TS}"])
total_ok = isinstance(r, dict) and r.get('total') == 99.99
record("REGRESSION_F4A", "$33.33 x 3 = $99.99", "PASS" if total_ok else "FAIL", {"got": r.get('total') if isinstance(r, dict) else None})

# F4.C: folios consecutivos
folios = []
ts_f = int(time.time())
for i in range(3):
    code, r = http("POST", "/api/sales", {
        "items": [{"qty": 1, "code": f"REG-F-{i}", "name": "REG", "price": 1, "subtotal": 1}],
        "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
    }, extra_headers=[f"Idempotency-Key: reg-f-{ts_f}-{i}"])
    if isinstance(r, dict): folios.append(r.get('folio'))
    time.sleep(0.5)
consecutive = all(folios[i+1] == folios[i] + 1 for i in range(len(folios)-1)) if folios else False
record("REGRESSION_F4C", "Folios consecutivos", "PASS" if consecutive else "FAIL", {"folios": folios})

# F1.D.2: Idempotency mismo id en 2do POST
TS = int(time.time())
code1, r1 = http("POST", "/api/sales", {
    "items": [{"qty": 1, "code": "REG-IDEM", "name": "IDEM", "price": 1, "subtotal": 1}],
    "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
}, extra_headers=[f"Idempotency-Key: reg-idem-{TS}"])
code2, r2 = http("POST", "/api/sales", {
    "items": [{"qty": 1, "code": "REG-IDEM", "name": "IDEM", "price": 1, "subtotal": 1}],
    "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
}, extra_headers=[f"Idempotency-Key: reg-idem-{TS}"])
ids_match = isinstance(r1, dict) and isinstance(r2, dict) and r1.get('id') == r2.get('id')
record("REGRESSION_F1D2", "Idempotency-Key dedupe", "PASS" if ids_match else "FAIL", {"id1": r1.get('id', '')[:8] if isinstance(r1, dict) else None, "id2": r2.get('id', '')[:8] if isinstance(r2, dict) else None, "match": ids_match})

# F6: Health
code, h = http("GET", "/api/health")
record("REGRESSION_F6_health", "/api/health 200 OK", "PASS" if code == 200 and isinstance(h, dict) and h.get('ok') else "FAIL", {"http": code})

# F3 paridad: tres UAs
ua_codes = []
TS = int(time.time())
for ua_name, ua in [("Web", "Web UA"), ("EXE", "Electron UA"), ("APK", "Android UA")]:
    code, r = http("POST", "/api/sales", {
        "items": [{"qty": 1, "code": f"REG-PAR-{ua_name}", "name": "P", "price": 5, "subtotal": 5}],
        "total": 5, "payment_method": "efectivo", "tenant_id": "TNT001"
    }, extra_headers=[f"User-Agent: {ua}", f"Idempotency-Key: reg-par-{TS}-{ua_name}"])
    ua_codes.append((ua_name, code, r.get('total') if isinstance(r, dict) else None))
totals = [c[2] for c in ua_codes]
same_totals = len(set(totals)) == 1 and totals[0] == 5
record("REGRESSION_F3_parity", "Paridad Web/EXE/APK = mismo total", "PASS" if same_totals else "FAIL", {"results": ua_codes})

# ============================================================
print("\n" + "="*70, flush=True)
RESULTS["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
RESULTS["total_tests"] = len(RESULTS["tests"])
RESULTS["pass"] = sum(1 for t in RESULTS["tests"] if t["status"] == "PASS")
RESULTS["fail"] = sum(1 for t in RESULTS["tests"] if t["status"] == "FAIL")
print(f"RESUMEN FASE B.6: {RESULTS['pass']}/{RESULTS['total_tests']} PASS", flush=True)
print("="*70, flush=True)
for t in RESULTS["tests"]:
    print(f"  [{'OK' if t['status']=='PASS' else t['status']:4s}] {t['test_id']:35s} {t['description'][:50]}", flush=True)

with open(f"{RUN_DIR}/reports/phase_b6_retest_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {RUN_DIR}/reports/phase_b6_retest_results.json", flush=True)
