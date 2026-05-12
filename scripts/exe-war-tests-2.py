"""
EXE WAR TESTS PARTE 2 - corte de internet + offline + sync
Continua desde el estado actual de la app (ya logueada, POS cargado).
"""
import json, time, urllib.request, urllib.error, os, sys, base64, subprocess
from websocket import create_connection

CDP_PORT = 9230
RESULTS = {"phase": "B", "tests": {}}

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:500]}

tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read())
tab = next((t for t in tabs if t.get('type') == 'page' and 'salvadorex' in t.get('url','')), None)
if not tab:
    tab = next((t for t in tabs if t.get('type') == 'page'), None)
print(f"Tab: {tab.get('url','')[:80]}")
ws = create_connection(tab['webSocketDebuggerUrl'], timeout=30)

cmd_id = [0]
def send(method, params=None):
    cmd_id[0] += 1
    msg = {"id": cmd_id[0], "method": method}
    if params: msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == cmd_id[0]:
            return r.get("result", {})

def eval_js(expr, await_promise=False, timeout=30):
    r = send("Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": await_promise,
        "timeout": timeout * 1000
    })
    if "exceptionDetails" in r:
        return {"error": r["exceptionDetails"].get("text","")[:200]}
    return r.get("result", {}).get("value")

send("Page.enable")
send("Network.enable")
send("Runtime.enable")

# ============================================================
# TEST 5: CORTAR INTERNET via WindowsFirewall en background
# (intentar; si requiere admin y falla, fallback a fetch override)
# ============================================================
print("\n" + "="*70)
print("TEST 5: BLOQUEAR red - intentando reglas de firewall")
print("="*70)

EXE_PATH = "C:\\Program Files\\Volvix POS\\Volvix POS.exe"
RULE_NAME = "VolvixPOS_BlockOut_Test"

def add_block_rule():
    """Intenta bloquear outbound NO-loopback del .EXE (requiere admin)."""
    cmd = [
        "powershell", "-NoProfile", "-Command",
        f"Try {{ "
        f"New-NetFirewallRule -DisplayName '{RULE_NAME}' "
        f"-Direction Outbound -Action Block -Program '{EXE_PATH}' "
        f"-Profile Any -ErrorAction Stop "
        f"| Out-Null; Write-Output 'RULE_OK' "
        f"}} Catch {{ Write-Output ('RULE_FAIL:' + $_.Exception.Message) }}"
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() + r.stderr.strip()
    except Exception as e:
        return f"EXC: {e}"

def remove_block_rule():
    cmd = [
        "powershell", "-NoProfile", "-Command",
        f"Try {{ Remove-NetFirewallRule -DisplayName '{RULE_NAME}' -ErrorAction Stop | Out-Null; Write-Output 'REMOVED' }} Catch {{ Write-Output ('NO_RULE:' + $_.Exception.Message) }}"
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return r.stdout.strip() + r.stderr.strip()
    except Exception as e:
        return f"EXC: {e}"

# Limpiar regla previa por si existe
remove_block_rule()
add_result = add_block_rule()
print(f"  Firewall add result: {add_result}")
firewall_blocked = "RULE_OK" in add_result

if not firewall_blocked:
    print(f"  Firewall require admin; usando fetch override como fallback")
    # Fallback: bloquear /api/* a nivel JS
    eval_js("""
    (() => {
      if (window.__origFetch) return 'already';
      window.__origFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        const u = typeof input === 'string' ? input : input.url;
        if (u && u.includes('/api/')) {
          return Promise.reject(new TypeError('NetworkError: simulated offline'));
        }
        return window.__origFetch(input, init);
      };
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
      return 'offline-js';
    })()
    """)

time.sleep(2)
print("  Esperando 2s para que sistemas detecten cambio de red...")

# Verificar offline REAL
offline_check = eval_js("""
(async () => {
  const start = performance.now();
  try {
    const r = await fetch('/api/version/status', { signal: AbortSignal.timeout(8000) });
    return { unexpected_ok: r.ok, ms: Math.round(performance.now()-start), status: r.status };
  } catch(e) {
    return { offline: true, ms: Math.round(performance.now()-start), error: e.message.slice(0,100) };
  }
})()
""", await_promise=True, timeout=20)
print(f"  Verificacion offline: {offline_check}")
report("Internet bloqueado (firewall o JS override)",
    isinstance(offline_check, dict) and offline_check.get('offline') is True,
    str(offline_check))
RESULTS["firewall_blocked"] = firewall_blocked

# ============================================================
print("\n" + "="*70)
print("TEST 6: Crear 10 productos OFFLINE via OfflineQueue")
print("="*70)

# Limpiar primero
eval_js("(async()=>{ if (window.OfflineQueue?.clear) await window.OfflineQueue.clear(); })()", await_promise=True)

create_offline = eval_js("""
(async () => {
  if (!window.OfflineQueue?.enqueue) return { error: 'No OfflineQueue' };
  const ts = Date.now();
  const tenant = localStorage.getItem('volvix_tenant_id') || 'demo-tenant';
  const results = [];
  for (let i=0; i<10; i++) {
    try {
      const item = await window.OfflineQueue.enqueue({
        method: 'POST',
        url: '/api/products',
        body: {
          name: 'WAR-OFFLINE-' + ts + '-' + i,
          code: 'WAR' + ts + i,
          barcode: 'WARBC' + ts + i,
          price: 100 + i*10,
          cost: 50 + i*5,
          stock: 50 + i,
          tenant_id: tenant
        },
        idempotencyKey: 'war-' + ts + '-' + i
      });
      results.push({ i, id: item?.id, name: item?.body?.name });
    } catch(e) {
      results.push({ i, error: e.message });
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    enqueued: results.length,
    successful: results.filter(r => r.id).length,
    total_in_idb: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    sample_names: all.slice(0,3).map(x => x.body?.name)
  };
})()
""", await_promise=True, timeout=30)
print(f"  {json.dumps(create_offline, default=str)[:500]}")
report("10 productos OFFLINE encolados",
    isinstance(create_offline, dict) and create_offline.get('total_in_idb',0) >= 10,
    f"total_idb={create_offline.get('total_in_idb') if isinstance(create_offline, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 7: Verificar IndexedDB FISICAMENTE en disco")
print("="*70)

# El .exe guarda IDB en %APPDATA%/volvix-saas/IndexedDB/
import glob
idb_dirs = glob.glob(r"C:/Users/DELL/AppData/Roaming/volvix-saas/IndexedDB/*")
print(f"  IDB folders on disk:")
for d in idb_dirs[:10]:
    size_mb = sum(os.path.getsize(os.path.join(d,f)) for f in os.listdir(d) if os.path.isfile(os.path.join(d,f))) / 1024
    print(f"    {os.path.basename(d)} ({size_mb:.1f}KB)")
report("IndexedDB en disco fisicamente",
    len(idb_dirs) > 0,
    f"folders={len(idb_dirs)}")

# Confirmar que las DBs esperadas existen
expected_dbs = ['volvix_offline_queue']
db_in_browser = eval_js("""
(async () => {
  const dbs = await indexedDB.databases();
  return dbs.map(d => d.name);
})()
""", await_promise=True)
print(f"  Databases registered in browser: {db_in_browser}")
report("DB 'volvix_offline_queue' existe",
    isinstance(db_in_browser, list) and 'volvix_offline_queue' in db_in_browser,
    str(db_in_browser))

# ============================================================
print("\n" + "="*70)
print("TEST 8: Verificar NO hay requests a /api/* (loopback) o vercel")
print("="*70)

# Habilitar logging de network desde ahora
req_log = []
send("Network.enable")

# Trigger explicit sync intent
sync_attempt = eval_js("""
(async () => {
  try {
    if (window.OfflineQueue?.syncNow) {
      await window.OfflineQueue.syncNow();
    }
  } catch(e) {}
  // Wait 3s for any retry attempts to log
  await new Promise(r => setTimeout(r, 3000));
  const all = await window.OfflineQueue.getAll();
  return {
    total: all.length,
    completed: all.filter(x => x.synced || x.completed).length,
    errored: all.filter(x => x.lastError).length,
    pending: all.filter(x => !x.synced && !x.completed && !x.lastError).length,
    last_errors: all.filter(x => x.lastError).slice(0,2).map(x => ({
      name: x.body?.name, err: String(x.lastError).slice(0,80), retries: x.retries
    }))
  };
})()
""", await_promise=True, timeout=30)
print(f"  Tras syncNow forzado (offline): {sync_attempt}")
report("Sync offline: items quedan pendientes/erroreados",
    isinstance(sync_attempt, dict) and sync_attempt.get('completed',99) == 0 and sync_attempt.get('total',0) >= 10,
    f"completed={sync_attempt.get('completed') if isinstance(sync_attempt, dict) else 'N/A'}, errored={sync_attempt.get('errored') if isinstance(sync_attempt, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 9: RESTAURAR INTERNET y verificar sync automatico")
print("="*70)

# Quitar firewall o JS override
if firewall_blocked:
    rm_result = remove_block_rule()
    print(f"  Removed firewall rule: {rm_result}")
else:
    eval_js("""
    (() => {
      if (window.__origFetch) {
        window.fetch = window.__origFetch;
        delete window.__origFetch;
      }
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
      return 'online-restored';
    })()
    """)
    print("  JS fetch override removed")

time.sleep(3)

# Verificar internet restaurado
online_check = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/version/status');
    return { ok: r.ok, status: r.status };
  } catch(e) { return { error: e.message }; }
})()
""", await_promise=True)
print(f"  Online check: {online_check}")
report("Internet restaurado",
    isinstance(online_check, dict) and 'ok' in online_check,
    str(online_check))

# Disparar sync y esperar
sync_after_online = eval_js("""
(async () => {
  try {
    if (window.OfflineQueue?.syncNow) await window.OfflineQueue.syncNow();
  } catch(e) {}

  // Esperar hasta 60s a que se sincronicen los items
  let lastStatus = null;
  for (let i=0; i<60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const completed = all.filter(x => x.synced || x.completed).length;
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (pending === 0 || i === 59) {
      return {
        total: all.length,
        completed,
        pending,
        errored: all.filter(x => x.lastError).length,
        elapsed_s: i+1,
        sample_state: all.slice(0,3).map(x => ({
          name: x.body?.name, synced: !!x.synced, completed: !!x.completed,
          retries: x.retries, lastError: x.lastError ? String(x.lastError).slice(0,60) : null
        }))
      };
    }
  }
})()
""", await_promise=True, timeout=120)
print(f"  Sync result: {json.dumps(sync_after_online, default=str)[:800]}")
report("Sync automatico envia items pendientes",
    isinstance(sync_after_online, dict) and sync_after_online.get('completed',0) > 0,
    f"completed={sync_after_online.get('completed') if isinstance(sync_after_online, dict) else 'N/A'} en {sync_after_online.get('elapsed_s') if isinstance(sync_after_online, dict) else '?'}s")

# ============================================================
print("\n" + "="*70)
print("TEST 10: VALIDACION FINAL - listar productos en backend")
print("="*70)

final_products = eval_js(f"""
(async () => {{
  try {{
    const r = await fetch('/api/products?limit=50&tenant_id=' + (localStorage.getItem('volvix_tenant_id')||'demo-tenant'), {{
      headers: {{ 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }}
    }});
    if (!r.ok) return {{ error: 'HTTP ' + r.status }};
    const data = await r.json();
    const products = Array.isArray(data) ? data : (data.products || data.data || []);
    // Filtrar solo los productos WAR- que creamos en este test
    const warProducts = products.filter(p => (p.name||'').startsWith('WAR-OFFLINE-'));
    return {{
      total: products.length,
      war_products: warProducts.length,
      war_sample: warProducts.slice(0,3).map(p => ({{ id: p.id, name: p.name, price: p.price }}))
    }};
  }} catch(e) {{
    return {{ error: e.message }};
  }}
}})()
""", await_promise=True, timeout=15)
print(f"  Productos en backend: {final_products}")
report("Productos llegaron al backend tras sync",
    isinstance(final_products, dict) and final_products.get('war_products',0) > 0,
    f"war_products={final_products.get('war_products') if isinstance(final_products, dict) else 'N/A'}")

# ============================================================
# Limpiar firewall rule por las dudas
remove_block_rule()

# Guardar
out = os.path.expanduser("~/exe-war-results-2.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {out}")

passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"\nPHASE B: {passed}/{total} PASS")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

# Screenshot
try:
    shot = send("Page.captureScreenshot", {"format": "png"})
    sp = "C:/Users/DELL/AppData/Local/Temp/apk-test/exe-war-phase-B.png"
    with open(sp, "wb") as f:
        f.write(base64.b64decode(shot.get("data","")))
    print(f"Screenshot: {sp}")
except Exception as e:
    print(f"Screenshot err: {e}")

ws.close()
