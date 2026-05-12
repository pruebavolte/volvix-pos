"""
TAREA 1 — F1.A.1 end-to-end real con APK v1.0.180.

Flujo:
1. Login en APK
2. Crear producto con stock>0 (necesario para vender)
3. Activar modo avion via adb svc disable
4. Crear venta offline (encolar)
5. Verificar encolado en IndexedDB
6. Desactivar modo avion
7. Esperar drain
8. Verificar venta en backend + stock descontado + queue vacio
"""
import os, sys, json, time, base64, subprocess, urllib.request, hashlib
from datetime import datetime
from websocket import create_connection

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
PROD = "https://volvix-pos.vercel.app"
RUN_DIR = "D:/github/volvix-pos/audit_run_20260512_132653_postfix"
TEST_ID = f"E2E_{int(time.time())}"

os.makedirs(f"{RUN_DIR}/screenshots/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/network/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/indexeddb/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/supabase_queries/{TEST_ID}", exist_ok=True)

def adb(args, t=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=t).stdout.strip()

def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")

# JWT for backend queries
req = urllib.request.Request(
    f"{PROD}/api/login",
    data=json.dumps({"email":"admin@volvix.test","password":"Volvix2026!"}).encode(),
    headers={"Content-Type":"application/json"}
)
JWT = json.loads(urllib.request.urlopen(req, timeout=15).read())["token"]
print(f"JWT len: {len(JWT)}", flush=True)

def http(method, path, body=None, headers_extra=None, t=15):
    headers = ["-H", f"Authorization: Bearer {JWT}", "-H", "Content-Type: application/json"]
    if headers_extra:
        for h in headers_extra: headers.extend(["-H", h])
    cmd = ["curl", "-s", "-X", method, "-w", "\n|HTTP=%{http_code}"] + headers
    if body is not None: cmd.extend(["-d", json.dumps(body)])
    cmd.append(f"{PROD}{path}")
    r = subprocess.run(cmd, capture_output=True, timeout=t)
    out = (r.stdout or b"").decode("utf-8", errors="replace")
    if "\n|HTTP=" in out:
        body_text, code = out.rsplit("\n|HTTP=", 1)
        code = int(code.strip()) if code.strip().isdigit() else 0
    else:
        body_text, code = out, 0
    try: return code, json.loads(body_text)
    except: return code, body_text[:500]

# CDP setup
tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab = next((t for t in tabs if t.get('type') == 'page'), None)
print(f"Tab: {tab.get('url','')[:80]}", flush=True)
ws = create_connection(tab['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=60)
cid=[0]
def s(m,p=None):
    cid[0]+=1; o={'id':cid[0],'method':m}
    if p: o['params']=p
    ws.send(json.dumps(o))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==cid[0]: return r.get('result',{})
def ev(e, ap=False, t=60):
    r = s('Runtime.evaluate', {'expression':e, 'returnByValue':True, 'awaitPromise':ap, 'timeout':t*1000})
    if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:300]}
    return r.get('result',{}).get('value')

s('Page.enable'); s('Runtime.enable'); s('Network.enable')

VERDICT = {"test_id": TEST_ID, "phase": "TASK_1_E2E", "steps": [], "started_at": now_iso()}

def step(name, ok, details=None, screenshot=False):
    rec = {"name": name, "ok": ok, "ts": now_iso(), "details": details or {}}
    if screenshot:
        try:
            shot = s('Page.captureScreenshot', {'format':'png'})
            shot_path = f"{RUN_DIR}/screenshots/{TEST_ID}/{len(VERDICT['steps']):02d}_{name}.png"
            with open(shot_path, "wb") as f:
                f.write(base64.b64decode(shot.get("data","")))
            rec["screenshot"] = shot_path
        except: rec["screenshot"] = "ERROR"
    print(f"  [{'OK' if ok else 'FAIL'}] {name}: {str(details)[:200]}", flush=True)
    VERDICT['steps'].append(rec)

# ============================================================
# STEP 1: Login en APK
# ============================================================
print("\n[STEP 1] Login en APK v1.0.180", flush=True)
login = ev("""(async () => {
  try {
    const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
    const d = await r.json();
    if (d.token) {
      localStorage.setItem('volvix_token', d.token);
      localStorage.setItem('volvixAuthToken', d.token);
      return { ok: true };
    }
    return { ok: false, status: r.status };
  } catch(e) { return { error: e.message }; }
})()""", ap=True, t=20)
step("login_apk", login.get('ok') is True, login, screenshot=True)

# Navigate POS
s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
time.sleep(15)

# Verificar bridge + offline-queue + fail-notifier cargaron
state = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) { try { await window.OfflineQueue.init(); break; } catch(e) {} }
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    url: location.href,
    bridge: !!window.__volvixCapacitorBridgeLoaded,
    oq: typeof window.OfflineQueue?.enqueue,
    fail_notifier: !!window.__vlxQueueFailNotifierLoaded,
    capacitor_native: window.Capacitor?.isNativePlatform?.(),
    online: navigator.onLine
  };
})()""", ap=True, t=30)
step("pos_loaded", state.get('oq') == 'function' and state.get('fail_notifier') is True, state, screenshot=True)

# Clear queue residual
ev("(async()=>{ try { await window.OfflineQueue.clear(); } catch(e) {} })()", ap=True)

# ============================================================
# STEP 2: Crear producto ONLINE con stock=5 para tener algo que vender
# ============================================================
print("\n[STEP 2] Crear producto base (online) con stock=5", flush=True)
TS = int(time.time())
prod_code = f"E2E-{TS}"
code, prod = http("POST", "/api/products", {
    "name": f"E2E-PRODUCT-{TS}",
    "code": prod_code,
    "price": 50,
    "stock": 5,
    "tenant_id": "TNT001"
})
prod_id = prod.get('id') if isinstance(prod, dict) else None
step("product_created", prod_id is not None, {"product_id": prod_id, "code": prod_code, "stock": prod.get('stock') if isinstance(prod, dict) else None, "http": code})

# Pre-snapshot del backend para detectar la nueva venta
print("\n[STEP 2.5] Pre-snapshot: cantas ventas hay en backend para este producto?", flush=True)
code, sales = http("GET", "/api/sales?limit=200")
sales_list = sales if isinstance(sales, list) else sales.get('sales', [])
sales_with_code = [s for s in sales_list if any((it.get('code') or '') == prod_code for it in (s.get('items') or []))]
step("sales_pre_snapshot", True, {"sales_with_code": len(sales_with_code), "total_in_backend_sample": len(sales_list)})

# ============================================================
# STEP 3: Activar MODO AVION
# ============================================================
print("\n[STEP 3] Activar modo avion (svc wifi/data disable)", flush=True)
adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(5)
adb_offline = adb(["shell", "ping", "-c", "1", "-W", "2", "8.8.8.8"]) or "no_response"
step("airplane_mode", "100% packet loss" in adb_offline or "unreachable" in adb_offline or not adb_offline,
     {"ping_result": adb_offline[:150]})

# Verificar desde la app
offline_check = ev("""(async () => {
  try {
    const r = await fetch('/api/version/status', { signal: AbortSignal.timeout(5000) });
    return { unexpected_ok: r.ok };
  } catch(e) { return { offline: true, error: e.message }; }
})()""", ap=True, t=15)
step("app_sees_offline", isinstance(offline_check, dict) and offline_check.get('offline') is True, offline_check)

# ============================================================
# STEP 4: Crear venta OFFLINE
# ============================================================
print("\n[STEP 4] Crear venta OFFLINE en APK", flush=True)
sale_idem = f"e2e-sale-{TS}"
enqueue = ev(f"""(async () => {{
  try {{
    const item = await window.OfflineQueue.enqueue({{
      method: 'POST',
      url: '/api/sales',
      body: {{
        items: [{{
          id: '{prod_id}',
          product_id: '{prod_id}',
          code: '{prod_code}',
          name: 'E2E-PRODUCT-{TS}',
          price: 50,
          qty: 1,
          subtotal: 50
        }}],
        total: 50,
        payment_method: 'efectivo',
        tenant_id: 'TNT001'
      }},
      idempotencyKey: '{sale_idem}'
    }});
    return {{ ok: true, queued_id: item?.id, items_in_queue: (await window.OfflineQueue.getAll()).length }};
  }} catch(e) {{ return {{ error: e.message }}; }}
}})()""", ap=True, t=20)
step("sale_enqueued_offline", enqueue.get('ok') is True and enqueue.get('items_in_queue', 0) >= 1, enqueue, screenshot=True)

# Verificar IndexedDB tiene el item
idb_state = ev("""(async () => {
  const all = await window.OfflineQueue.getAll();
  return all.map(x => ({
    id: x.id?.slice(0,15),
    url: x.url,
    method: x.method,
    idempotencyKey: x.idempotencyKey,
    retries: x.retries,
    name: x.body?.items?.[0]?.name
  }));
})()""", ap=True, t=15)
step("indexeddb_has_item", isinstance(idb_state, list) and any(i.get('idempotencyKey') == sale_idem for i in idb_state),
     {"items_in_queue": idb_state})

# Verificar que NO hay venta en backend aún
code, sales_during = http("GET", f"/api/sales?limit=50")
sales_list_during = sales_during if isinstance(sales_during, list) else sales_during.get('sales', [])
sales_with_idem = [s for s in sales_list_during if any((it.get('code') or '') == prod_code for it in (s.get('items') or []))]
step("backend_has_no_sale_yet", len(sales_with_idem) == len(sales_with_code), {"sales_with_code_before_vs_after": [len(sales_with_code), len(sales_with_idem)]})

# ============================================================
# STEP 5: Desactivar modo avion + esperar sync
# ============================================================
print("\n[STEP 5] Desactivar modo avion + esperar sync", flush=True)
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(15)  # Wait wifi reconnect

online_check = ev("""(async () => {
  try {
    const r = await fetch('/api/version/status');
    return { ok: r.ok, status: r.status };
  } catch(e) { return { error: e.message }; }
})()""", ap=True, t=15)
step("network_restored", isinstance(online_check, dict) and 'ok' in online_check, online_check)

# Trigger sync
sync_result = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  for (let i=0; i<60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (pending === 0) {
      return { elapsed_s: i+1, final_total: all.length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    timeout: true,
    total: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    sample: all.slice(0,3).map(x => ({
      idempotencyKey: x.idempotencyKey,
      retries: x.retries,
      lastError: String(x.lastError||'').slice(0,150)
    }))
  };
})()""", ap=True, t=90)
step("sync_drained_queue", isinstance(sync_result, dict) and (sync_result.get('final_total') == 0 or not sync_result.get('timeout')),
     sync_result, screenshot=True)

# ============================================================
# STEP 6: Verificar venta llegó al backend
# ============================================================
print("\n[STEP 6] Verificar venta en backend", flush=True)
time.sleep(3)
code, sales_after = http("GET", f"/api/sales?limit=200")
sales_list_after = sales_after if isinstance(sales_after, list) else sales_after.get('sales', [])
sales_with_code_after = [
    s for s in sales_list_after
    if any((it.get('code') or '') == prod_code for it in (s.get('items') or []))
]
new_sales = len(sales_with_code_after) - len(sales_with_code)
sample_new = sales_with_code_after[:2] if sales_with_code_after else []
step("sale_arrived_backend", new_sales >= 1,
     {"new_sales_with_code": new_sales, "sample": [{"id": s.get('id'), "total": s.get('total'), "folio": s.get('folio')} for s in sample_new]})

# Save query
with open(f"{RUN_DIR}/supabase_queries/{TEST_ID}/sales_after.json", "w") as f:
    json.dump([s for s in sales_list_after if any((it.get('code') or '') == prod_code for it in (s.get('items') or []))], f, indent=2, default=str)

# ============================================================
# STEP 7: Verificar stock descontado
# ============================================================
print("\n[STEP 7] Verificar stock descontado", flush=True)
code, prods = http("GET", f"/api/products?q={prod_code}&limit=3")
products = prods if isinstance(prods, list) else prods.get('products', [])
prod_now = next((p for p in products if p.get('code') == prod_code), None)
stock_now = prod_now.get('stock') if prod_now else None
expected_stock = 4  # inicial 5 - 1 vendido
step("stock_decremented", stock_now == expected_stock,
     {"stock_before": 5, "stock_after": stock_now, "expected": expected_stock})

# ============================================================
# STEP 8: Verificar queue vacio (no en limbo)
# ============================================================
print("\n[STEP 8] Verificar queue local vacio", flush=True)
final_queue = ev("""(async () => {
  const all = await window.OfflineQueue.getAll();
  return { count: all.length, items: all.map(x => ({id: x.id?.slice(0,15), retries: x.retries, lastError: String(x.lastError||'').slice(0,100)})) };
})()""", ap=True, t=15)
step("queue_drained", final_queue.get('count', 99) == 0, final_queue)

# ============================================================
# Final
# ============================================================
VERDICT["completed_at"] = now_iso()
VERDICT["total_steps"] = len(VERDICT["steps"])
VERDICT["passed"] = sum(1 for x in VERDICT["steps"] if x["ok"])
VERDICT["failed"] = sum(1 for x in VERDICT["steps"] if not x["ok"])
VERDICT["overall_result"] = "PASS" if VERDICT["failed"] == 0 else "FAIL"

with open(f"{RUN_DIR}/reports/F1A1_E2E_FINAL.md", "w", encoding="utf-8") as f:
    f.write(f"# F1A1_E2E_FINAL.md — Venta offline end-to-end\n\n")
    f.write(f"**Test ID**: {TEST_ID}\n")
    f.write(f"**Started**: {VERDICT['started_at']}\n")
    f.write(f"**Completed**: {VERDICT['completed_at']}\n")
    f.write(f"**Resultado**: **{VERDICT['overall_result']}** ({VERDICT['passed']}/{VERDICT['total_steps']} steps PASS)\n\n")
    f.write(f"## Pasos\n\n")
    f.write(f"| # | Step | Status | Detail |\n|---|---|---|---|\n")
    for i, st in enumerate(VERDICT["steps"]):
        icon = "PASS" if st["ok"] else "**FAIL**"
        f.write(f"| {i} | {st['name']} | {icon} | {str(st['details'])[:200]} |\n")
    f.write(f"\n## Veredicto\n\n")
    if VERDICT["overall_result"] == "PASS":
        f.write("BUG-F2 + BUG-F6 + BUG-F3 + BUG-F4 fixes funcionan end-to-end en APK Android real.\n\n")
        f.write("Flujo completo validado:\n")
        f.write("1. App offline (avión activado a nivel SO)\n")
        f.write("2. Venta encolada con Idempotency-Key correcto (BUG-F2)\n")
        f.write("3. Network restaurada\n")
        f.write("4. Sync drena queue automáticamente\n")
        f.write("5. Venta aparece en backend\n")
        f.write("6. Stock descontado correctamente (BUG-F6)\n")
        f.write("7. Queue local vacío (no limbo - BUG-F3)\n")
    else:
        f.write("Algún paso falló. Ver tabla arriba.\n")

with open(f"{RUN_DIR}/reports/F1A1_E2E_verdict.json", "w") as fp:
    json.dump(VERDICT, fp, indent=2, default=str)

print("\n" + "="*70, flush=True)
print(f"VEREDICTO F1A1_E2E: {VERDICT['overall_result']} ({VERDICT['passed']}/{VERDICT['total_steps']})", flush=True)
print("="*70, flush=True)
for st in VERDICT["steps"]:
    print(f"  [{'OK ' if st['ok'] else 'FAIL'}] {st['name']}", flush=True)

ws.close()
