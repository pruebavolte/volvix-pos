"""
WEB/PWA WAR TESTS - pruebas extremas del WEB en produccion (Vercel)
con CDP en Chrome port 9231.

Validar:
- Service Worker activo + cacheo
- IndexedDB persistencia
- Login online
- Offline mode (CDP Network.emulateNetworkConditions)
- Reload offline (debe cargar del SW cache)
- Crear productos offline -> queue
- Reconectar -> sync
"""
import json, time, urllib.request, urllib.error, os, sys, base64
from websocket import create_connection

CDP_PORT = 9231
PROD_URL = "https://volvix-pos.vercel.app"
RESULTS = {"phase": "WEB", "tests": {}}

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:500]}

tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read())
tab = None
for t in tabs:
    if t.get('type') == 'page' and 'vercel.app' in t.get('url',''):
        tab = t; break
if not tab:
    for t in tabs:
        if t.get('type') == 'page' and 'chrome-extension' not in t.get('url',''):
            tab = t; break

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
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": await_promise, "timeout": timeout * 1000})
    if "exceptionDetails" in r:
        return {"error": r["exceptionDetails"].get("text","")[:200]}
    return r.get("result", {}).get("value")

send("Page.enable")
send("Network.enable")
send("Runtime.enable")

# ============================================================
print("\n" + "="*70)
print("TEST 1: Login en produccion")
print("="*70)

login = eval_js(f"""
(async () => {{
  try {{
    const r = await fetch('/api/login', {{
      method:'POST', headers:{{'Content-Type':'application/json'}},
      body: JSON.stringify({{ email:'admin@volvix.test', password:'Volvix2026!' }})
    }});
    const d = await r.json();
    if (d.token) {{
      localStorage.setItem('volvix_token', d.token);
      if (d.user) localStorage.setItem('volvix_user', JSON.stringify(d.user));
      return {{ ok: true, status: r.status, hasToken: !!d.token }};
    }}
    return {{ ok: false, status: r.status, body: JSON.stringify(d).slice(0,200) }};
  }} catch(e) {{ return {{ error: e.message }}; }}
}})()
""", await_promise=True, timeout=15)
print(f"  Login: {login}")
report("Login produccion", isinstance(login, dict) and login.get('ok'), str(login))

# Navegar al POS
send("Page.navigate", {"url": f"{PROD_URL}/salvadorex-pos.html"})
time.sleep(8)

# ============================================================
print("\n" + "="*70)
print("TEST 2: POS cargado + Service Worker activo")
print("="*70)

state = eval_js("""
(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) {
      try { await window.OfflineQueue.init(); break; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const swReg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null;
  const cacheNames = 'caches' in window ? await caches.keys() : [];
  return {
    url: location.href,
    swController: !!navigator.serviceWorker?.controller,
    swState: swReg ? swReg.active?.state : null,
    cacheNames: cacheNames,
    oqApi: typeof window.OfflineQueue?.enqueue,
    oqSize: typeof window.OfflineQueue?.size === 'function' ? await window.OfflineQueue.size() : -1,
    idbDatabases: (await indexedDB.databases()).map(d=>d.name)
  };
})()
""", await_promise=True)
print(f"  {json.dumps(state, default=str, indent=2)[:600]}")
report("SW + OfflineQueue + IDB OK",
    isinstance(state, dict) and state.get('swController') and state.get('oqApi') == 'function',
    f"SW={state.get('swController') if isinstance(state, dict) else 'N/A'}")
RESULTS["web_state"] = state

# Limpiar queue
eval_js("(async()=>{ if (window.OfflineQueue?.clear) await window.OfflineQueue.clear(); })()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 3: Cache Storage contiene assets criticos")
print("="*70)

cache_check = eval_js("""
(async () => {
  if (!('caches' in window)) return { error: 'no Cache API' };
  const names = await caches.keys();
  const all_entries = {};
  for (const n of names) {
    const c = await caches.open(n);
    const keys = await c.keys();
    all_entries[n] = {
      count: keys.length,
      sample: keys.slice(0,5).map(k => new URL(k.url).pathname)
    };
  }
  return all_entries;
})()
""", await_promise=True)
print(f"  {json.dumps(cache_check, default=str, indent=2)[:800]}")
total_cached = sum(v.get('count',0) for v in cache_check.values()) if isinstance(cache_check, dict) else 0
report("Cache Storage tiene assets",
    total_cached > 0,
    f"total_cached={total_cached}")

# ============================================================
print("\n" + "="*70)
print("TEST 4: Cortar internet via CDP")
print("="*70)

send("Network.emulateNetworkConditions", {
    "offline": True, "downloadThroughput": 0, "uploadThroughput": 0, "latency": 0
})
time.sleep(2)

offline_check = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/version/status');
    return { unexpected_ok: r.ok, status: r.status };
  } catch(e) {
    return { offline: true, error: e.message };
  }
})()
""", await_promise=True, timeout=15)
print(f"  Offline check: {offline_check}")
report("Internet cortado via CDP",
    isinstance(offline_check, dict) and offline_check.get('offline') is True,
    str(offline_check))

# ============================================================
print("\n" + "="*70)
print("TEST 5: Crear 5 productos OFFLINE")
print("="*70)

create = eval_js("""
(async () => {
  const ts = Date.now();
  const results = [];
  for (let i=0; i<5; i++) {
    try {
      const item = await window.OfflineQueue.enqueue({
        method: 'POST',
        url: '/api/products',
        body: {
          name: 'WEB-OFFLINE-' + ts + '-' + i,
          code: 'WEB' + ts + i,
          price: 100 + i*10,
          tenant_id: 'demo-tenant'
        },
        idempotencyKey: 'web-' + ts + '-' + i
      });
      results.push({ i, id: item?.id });
    } catch(e) { results.push({ i, error: e.message }); }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    enqueued: results.filter(r => r.id).length,
    inIDB: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length
  };
})()
""", await_promise=True, timeout=15)
print(f"  {create}")
report("5 productos WEB offline persistidos",
    isinstance(create, dict) and create.get('inIDB',0) >= 5,
    str(create))

# ============================================================
print("\n" + "="*70)
print("TEST 6: RELOAD OFFLINE - SW debe servir desde cache")
print("="*70)

send("Page.reload", {"ignoreCache": False})
time.sleep(6)

reload_check = eval_js("""
(async () => {
  return {
    url: location.href,
    bodyLen: document.body?.innerHTML?.length || 0,
    title: document.title.slice(0,40),
    hasOQ: typeof window.OfflineQueue?.enqueue,
    fromCache: !!navigator.serviceWorker?.controller
  };
})()
""", await_promise=True)
print(f"  {reload_check}")
report("Reload offline carga desde SW cache",
    isinstance(reload_check, dict) and reload_check.get('bodyLen',0) > 1000,
    str(reload_check))

# ============================================================
print("\n" + "="*70)
print("TEST 7: Items siguen en IDB tras reload offline")
print("="*70)

idb_after_reload = eval_js("""
(async () => {
  if (window.OfflineQueue?.init) {
    try { await window.OfflineQueue.init(); } catch(e) {}
  }
  const all = await window.OfflineQueue?.getAll() || [];
  return {
    total: all.length,
    sample: all.slice(0,3).map(x => x.body?.name)
  };
})()
""", await_promise=True)
print(f"  {idb_after_reload}")
report("IDB sobrevive reload offline",
    isinstance(idb_after_reload, dict) and idb_after_reload.get('total',0) >= 5,
    str(idb_after_reload))

# ============================================================
print("\n" + "="*70)
print("TEST 8: RESTAURAR INTERNET + sync")
print("="*70)

send("Network.emulateNetworkConditions", {
    "offline": False, "downloadThroughput": -1, "uploadThroughput": -1, "latency": 0
})
time.sleep(2)

sync = eval_js("""
(async () => {
  try { await window.OfflineQueue.syncNow(); } catch(e) {}
  for (let i=0; i<45; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (pending === 0) {
      return {
        elapsed_s: i+1,
        total: all.length,
        completed: all.filter(x => x.synced || x.completed).length,
        pending,
        errored: all.filter(x => x.lastError).length
      };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    timeout: true,
    total: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    errored: all.filter(x => x.lastError).length,
    sample: all.slice(0,3).map(x => ({ name: x.body?.name, retries: x.retries, err: String(x.lastError||'').slice(0,80) }))
  };
})()
""", await_promise=True, timeout=90)
print(f"  Sync: {json.dumps(sync, default=str, indent=2)[:700]}")
report("Sync WEB tras restaurar internet",
    isinstance(sync, dict) and sync.get('completed',0) > 0,
    f"completed={sync.get('completed') if isinstance(sync, dict) else 'N/A'}, pending={sync.get('pending') if isinstance(sync, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 9: Backend valida productos WEB-OFFLINE creados")
print("="*70)

backend = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/products?limit=50', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const d = await r.json();
    const products = Array.isArray(d) ? d : (d.products || []);
    const web = products.filter(p => (p.name||'').startsWith('WEB-OFFLINE-'));
    return {
      total: products.length,
      web_products: web.length,
      sample: web.slice(0,2).map(p => ({ name: p.name, price: p.price, id: p.id }))
    };
  } catch(e) { return { error: e.message }; }
})()
""", await_promise=True, timeout=15)
print(f"  {backend}")
report("Productos WEB llegan al backend",
    isinstance(backend, dict) and backend.get('web_products',0) > 0,
    str(backend))

# ============================================================
print("\n" + "="*70)
print("RESUMEN WEB/PWA")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

# Save
out = os.path.expanduser("~/web-war-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {out}")

# Screenshot
try:
    shot = send("Page.captureScreenshot", {"format": "png"})
    sp = "C:/Users/DELL/AppData/Local/Temp/web-war/web-final.png"
    with open(sp, "wb") as f:
        f.write(base64.b64decode(shot.get("data","")))
    print(f"Screenshot: {sp}")
except Exception as e:
    print(f"Screenshot err: {e}")

ws.close()
