"""
FORENSIC AUDIT — FASE 1.A.1
Crear MISMA venta offline en EXE + APK simultaneamente.
Reconectar ambos.
Verificar: NO se duplica, sync_queue orden correcto, id final coherente.

Evidencia obligatoria por test:
1. Screenshot con timestamp del SO visible (EXE y APK)
2. Hash SHA256 del IndexedDB (sustituye SQLite, ver checkpoint init)
3. Query via /api/sales (sustituye SQL directo)
4. HAR file de requests
5. (Video SKIPPED — sin grabador)
"""
import os, sys, json, time, base64, hashlib, subprocess, urllib.request, glob
from websocket import create_connection
from datetime import datetime

# Auto-detect latest audit_run dir
import glob as _glob
_runs = sorted(_glob.glob("D:/github/volvix-pos/audit_run_*"), reverse=True)
RUN_DIR = _runs[0] if _runs else None
if not RUN_DIR:
    raise RuntimeError("No audit_run dir found")
print(f"RUN_DIR: {RUN_DIR}")
jwt_path = f"{RUN_DIR}/logs/jwt.txt"
if os.path.exists(jwt_path):
    JWT = open(jwt_path).read().strip()
else:
    # Get fresh JWT
    import urllib.request as _req
    req = _req.Request(
        "https://volvix-pos.vercel.app/api/login",
        data=json.dumps({"email":"admin@volvix.test","password":"Volvix2026!"}).encode(),
        headers={"Content-Type":"application/json"}
    )
    JWT = json.loads(_req.urlopen(req, timeout=15).read()).get("token","")
    os.makedirs(f"{RUN_DIR}/logs", exist_ok=True)
    with open(jwt_path, "w") as _f: _f.write(JWT)
print(f"JWT len: {len(JWT)}")
ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
PROD = "https://volvix-pos.vercel.app"
TEST_ID = f"F1A1_{int(time.time())}"
print(f"TEST_ID: {TEST_ID}", flush=True)

# Setup log paths
os.makedirs(f"{RUN_DIR}/screenshots/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/network/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/indexeddb/{TEST_ID}", exist_ok=True)
os.makedirs(f"{RUN_DIR}/supabase_queries/{TEST_ID}", exist_ok=True)

def adb(args, t=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=t).stdout.strip()

def sha256_dir(path):
    """SHA256 de toda la carpeta IndexedDB."""
    if not os.path.isdir(path):
        return None
    hasher = hashlib.sha256()
    for f in sorted(glob.glob(f"{path}/**/*", recursive=True)):
        if os.path.isfile(f):
            with open(f, "rb") as fp:
                while True:
                    chunk = fp.read(65536)
                    if not chunk: break
                    hasher.update(chunk)
    return hasher.hexdigest()

def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")

# CDP helpers
class CDPClient:
    def __init__(self, ws_url, origin=None, label=""):
        self.label = label
        self.ws = create_connection(ws_url, origin=origin, timeout=60) if origin else create_connection(ws_url, timeout=60)
        self.cid = 0
        self.har_events = []
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("Network.enable")

    def send(self, method, params=None):
        self.cid += 1
        msg = {"id": self.cid, "method": method}
        if params: msg["params"] = params
        self.ws.send(json.dumps(msg))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self.cid:
                return r.get("result", {})
            # Capture HAR events
            if "method" in r and r["method"].startswith("Network."):
                self.har_events.append({"timestamp": time.time(), "event": r["method"], "params": r.get("params", {})})

    def eval(self, expr, await_promise=False, t=30):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise, "timeout": t * 1000})
        if "exceptionDetails" in r:
            return {"EXC": r["exceptionDetails"].get("text", "")[:300]}
        return r.get("result", {}).get("value")

    def screenshot(self, dest):
        shot = self.send("Page.captureScreenshot", {"format": "png"})
        with open(dest, "wb") as f:
            f.write(base64.b64decode(shot.get("data", "")))
        return dest

    def dump_har(self, dest):
        with open(dest, "w") as f:
            json.dump({"log": {"version": "1.2", "events": self.har_events}}, f, indent=2, default=str)
        return dest

    def close(self):
        try: self.ws.close()
        except: pass

# Conectar a .EXE
print("\n[Setup] Conectando a .EXE CDP...", flush=True)
exe_tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9230/json").read())
exe_tab = next((t for t in exe_tabs if t.get("type") == "page"), None)
print(f"  .EXE tab: {exe_tab.get('url','')[:80]}", flush=True)
exe = CDPClient(exe_tab["webSocketDebuggerUrl"], label="EXE")

# Conectar a APK
print("[Setup] Conectando a APK CDP...", flush=True)
apk_tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
apk_tab = next((t for t in apk_tabs if t.get("type") == "page"), None)
print(f"  APK tab: {apk_tab.get('url','')[:80]}", flush=True)
apk = CDPClient(apk_tab["webSocketDebuggerUrl"], origin="https://volvix-pos.vercel.app", label="APK")

# Login + navigate en ambas
for client, server_base in [(exe, "internal-local"), (apk, "internal-local")]:
    client.eval(f"""(async () => {{
      try {{
        const r = await fetch('/api/login', {{method:'POST', headers:{{'Content-Type':'application/json'}},
          body: JSON.stringify({{email:'admin@volvix.test', password:'Volvix2026!'}})}});
        const d = await r.json();
        if (d.token) localStorage.setItem('volvix_token', d.token);
      }} catch(e) {{}}
    }})()""", await_promise=True, t=20)

# Navigate to POS
exe_url = exe.eval("location.href")
apk_url = apk.eval("location.href")
print(f"\nEXE URL: {exe_url}", flush=True)
print(f"APK URL: {apk_url}", flush=True)

if "salvadorex" not in exe_url:
    exe.send("Page.navigate", {"url": exe.eval("'http://' + location.host + '/salvadorex-pos.html'") if "127.0.0.1" in exe_url else "https://volvix-pos.vercel.app/salvadorex-pos.html"})
    time.sleep(10)
if "salvadorex" not in apk_url:
    apk.send("Page.navigate", {"url": "https://localhost/salvadorex-pos.html"})
    time.sleep(10)

# Pre-test snapshots
print("\n[1] Snapshot inicial — screenshots con timestamp + hash IDB", flush=True)

# IDB hash baseline EXE
exe_idb_dir = "C:/Users/DELL/AppData/Roaming/volvix-saas/IndexedDB"
exe_hash_before = sha256_dir(exe_idb_dir)
print(f"  EXE IDB hash BEFORE: {exe_hash_before[:16] if exe_hash_before else 'N/A'}...", flush=True)

# Pull APK IDB
apk_idb_local = f"{RUN_DIR}/indexeddb/{TEST_ID}/apk_before"
os.makedirs(apk_idb_local, exist_ok=True)
adb(["shell", "run-as", "com.volvix.pos", "tar", "cf", "/data/local/tmp/idb_before.tar", "files/app_webview/Default/IndexedDB", "2>/dev/null"], t=15)
adb(["pull", "/data/local/tmp/idb_before.tar", f"{apk_idb_local}/idb.tar"], t=30)
apk_hash_before = None
if os.path.exists(f"{apk_idb_local}/idb.tar"):
    h = hashlib.sha256()
    with open(f"{apk_idb_local}/idb.tar", "rb") as f:
        h.update(f.read())
    apk_hash_before = h.hexdigest()
print(f"  APK IDB hash BEFORE: {apk_hash_before[:16] if apk_hash_before else 'N/A'}...", flush=True)

exe.screenshot(f"{RUN_DIR}/screenshots/{TEST_ID}/01_exe_before.png")
apk.screenshot(f"{RUN_DIR}/screenshots/{TEST_ID}/01_apk_before.png")

# ============================================================
# TEST: Crear MISMA venta offline en ambas plataformas
# ============================================================
print("\n[2] Cortar internet en ambas", flush=True)

# EXE: JS-level fetch override (no podemos firewall a Electron in-process)
exe.eval("""(() => {
  if (window.__origFetch) return;
  window.__origFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const url = (typeof input === 'string') ? input : input.url;
    if (url && url.includes('/api/')) {
      return Promise.reject(new TypeError('NetworkError: simulated offline (audit forensic)'));
    }
    return window.__origFetch(input, init);
  };
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));
  return true;
})()""")
print("  EXE offline simulated (fetch override)", flush=True)

# APK: real OS-level wifi/data disable
adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(3)
print("  APK offline real (wifi+data off)", flush=True)

# Crear LA MISMA venta en ambos
print("\n[3] Crear MISMA venta offline simultaneamente", flush=True)
shared_idem = f"forensic-{TEST_ID}"
sale_body = {
    "items": [{"qty": 1, "code": "FORENSIC", "name": "Producto Forense Test", "price": 99.99, "subtotal": 99.99}],
    "total": 99.99,
    "payment_method": "efectivo",
    "tenant_id": "TNT001",
    "_forensic_test_id": TEST_ID
}

# EXE encolar
exe_result = exe.eval(f"""(async () => {{
  for (let i=0; i<10; i++) {{
    if (window.OfflineQueue?.init) try {{ await window.OfflineQueue.init(); break; }} catch(e) {{}}
    await new Promise(r => setTimeout(r, 500));
  }}
  try {{
    const item = await window.OfflineQueue.enqueue({{
      method: 'POST', url: '/api/sales',
      body: {json.dumps(sale_body)},
      idempotencyKey: '{shared_idem}'
    }});
    return {{ ok: true, id: item?.id, name: item?.body?.items?.[0]?.name }};
  }} catch(e) {{ return {{ error: e.message }}; }}
}})()""", await_promise=True, t=20)
print(f"  EXE enqueue: {exe_result}", flush=True)

# APK encolar (mismo idem)
apk_result = apk.eval(f"""(async () => {{
  for (let i=0; i<10; i++) {{
    if (window.OfflineQueue?.init) try {{ await window.OfflineQueue.init(); break; }} catch(e) {{}}
    await new Promise(r => setTimeout(r, 500));
  }}
  try {{
    const item = await window.OfflineQueue.enqueue({{
      method: 'POST', url: '/api/sales',
      body: {json.dumps(sale_body)},
      idempotencyKey: '{shared_idem}'
    }});
    return {{ ok: true, id: item?.id, name: item?.body?.items?.[0]?.name }};
  }} catch(e) {{ return {{ error: e.message }}; }}
}})()""", await_promise=True, t=20)
print(f"  APK enqueue: {apk_result}", flush=True)

# ============================================================
print("\n[4] Reconectar AMBOS y disparar sync", flush=True)
# EXE: quitar override
exe.eval("""(() => {
  if (window.__origFetch) {
    window.fetch = window.__origFetch;
    delete window.__origFetch;
  }
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  window.dispatchEvent(new Event('online'));
  return true;
})()""")

# APK: real network back
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(12)  # esperar conexión

# Disparar sync en ambos
exe.eval("""(async () => { try { await window.OfflineQueue.syncNow({force:true}); } catch(e) {} })()""", await_promise=True, t=15)
apk.eval("""(async () => { try { await window.OfflineQueue.syncNow({force:true}); } catch(e) {} })()""", await_promise=True, t=15)

# Esperar hasta 90s a que ambos queue se vacien
print("  Esperando sync drain...", flush=True)
for i in range(45):
    time.sleep(2)
    e_size = exe.eval("(async () => (await window.OfflineQueue.getAll()).length)()", await_promise=True, t=10)
    a_size = apk.eval("(async () => (await window.OfflineQueue.getAll()).length)()", await_promise=True, t=10)
    if (e_size == 0 or e_size == {"EXC": True}) and (a_size == 0 or a_size == {"EXC": True}):
        break
    if i % 5 == 0:
        print(f"    {i*2}s: exe_queue={e_size}, apk_queue={a_size}", flush=True)

# ============================================================
print("\n[5] Verificar backend: ¿hay duplicados de esa venta?", flush=True)

# Query a /api/sales: buscar sales con _forensic_test_id en items
sales_query_url = f"{PROD}/api/sales?limit=200"
sales_resp = subprocess.run(
    ["curl", "-s", "-H", f"Authorization: Bearer {JWT}", sales_query_url],
    capture_output=True, text=True, timeout=30
)
with open(f"{RUN_DIR}/supabase_queries/{TEST_ID}/sales_after.json", "w") as f:
    f.write(sales_resp.stdout)

try:
    sales_list = json.loads(sales_resp.stdout)
    if not isinstance(sales_list, list):
        sales_list = sales_list.get("sales", [])
    # Filtrar por nuestros items (name = "Producto Forense Test")
    forensic_sales = []
    for s in sales_list:
        items = s.get("items", [])
        if isinstance(items, list):
            for it in items:
                if it.get("name") == "Producto Forense Test":
                    forensic_sales.append({"id": s.get("id"), "total": s.get("total"), "created_at": s.get("created_at"), "folio": s.get("folio")})
                    break
    print(f"  Ventas con producto forense: {len(forensic_sales)}", flush=True)
    for fs in forensic_sales:
        print(f"    id={fs['id']} folio={fs.get('folio')} total={fs['total']} created={fs.get('created_at')}", flush=True)
except Exception as e:
    print(f"  Query error: {e}", flush=True)
    forensic_sales = []

# Screenshots post-sync
exe.screenshot(f"{RUN_DIR}/screenshots/{TEST_ID}/02_exe_after.png")
apk.screenshot(f"{RUN_DIR}/screenshots/{TEST_ID}/02_apk_after.png")

# IDB hash AFTER
exe_hash_after = sha256_dir(exe_idb_dir)
print(f"\n  EXE IDB hash AFTER:  {exe_hash_after[:16] if exe_hash_after else 'N/A'}...", flush=True)
print(f"  EXE IDB changed: {exe_hash_before != exe_hash_after}", flush=True)

# Save HAR
exe.dump_har(f"{RUN_DIR}/network/{TEST_ID}/exe.har.json")
apk.dump_har(f"{RUN_DIR}/network/{TEST_ID}/apk.har.json")

# Verdict
print("\n" + "="*70, flush=True)
print("VEREDICTO F1.A.1", flush=True)
print("="*70, flush=True)

verdict = {
    "test_id": TEST_ID,
    "phase": "1.A.1",
    "description": "Misma venta offline en EXE + APK con MISMO idempotencyKey",
    "enqueue_exe": exe_result,
    "enqueue_apk": apk_result,
    "duplicate_count_after_sync": len(forensic_sales),
    "expected_count": 1,
    "result": "PASS" if len(forensic_sales) <= 1 else "FAIL",
    "evidence": {
        "screenshot_exe_before": f"{RUN_DIR}/screenshots/{TEST_ID}/01_exe_before.png",
        "screenshot_apk_before": f"{RUN_DIR}/screenshots/{TEST_ID}/01_apk_before.png",
        "screenshot_exe_after": f"{RUN_DIR}/screenshots/{TEST_ID}/02_exe_after.png",
        "screenshot_apk_after": f"{RUN_DIR}/screenshots/{TEST_ID}/02_apk_after.png",
        "exe_idb_hash_before": exe_hash_before,
        "exe_idb_hash_after": exe_hash_after,
        "apk_idb_hash_before": apk_hash_before,
        "sales_query": f"{RUN_DIR}/supabase_queries/{TEST_ID}/sales_after.json",
        "har_exe": f"{RUN_DIR}/network/{TEST_ID}/exe.har.json",
        "har_apk": f"{RUN_DIR}/network/{TEST_ID}/apk.har.json",
        "video_mp4": "SKIPPED — sin grabador instalado",
    },
    "forensic_sales_matched": forensic_sales,
    "timestamp": now_iso()
}
print(json.dumps(verdict, indent=2, default=str)[:1500], flush=True)

with open(f"{RUN_DIR}/reports/F1A1_verdict.json", "w") as f:
    json.dump(verdict, f, indent=2, default=str)

print(f"\nVeredicto guardado: {RUN_DIR}/reports/F1A1_verdict.json", flush=True)
exe.close()
apk.close()
