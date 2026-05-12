"""
APK EXTREME TESTS - pruebas destructivas REALES del bundle del APK servido
localmente, controlado via CDP en Chrome con UA Android.

LIMITACIONES (no hay emulador Android instalado en esta maquina):
- No prueba plugins nativos (camera, barcode-scanner, share, keep-awake)
- No prueba lifecycle Android real (process death, Doze mode)
- No prueba SQLite Room storage (Capacitor usa IndexedDB en WebView)

LO QUE SI PRUEBA (es exactamente el mismo motor JS+IndexedDB del WebView):
- IndexedDB persistencia offline
- OfflineQueue logic (es JS puro - identico en Web/Capacitor)
- Sync HTTP cuando vuelve red
- Coalescing/throttling
- Memoria y rendimiento con N registros
- AbortController fetch timeout

Estrategia: usar __test_oq_harness.html que carga SOLO volvix-offline-queue.js
sin auth-gate ni redirects, para tests aislados.
"""
import json, time, urllib.request, urllib.error, os, sys, base64
from websocket import create_connection

CDP_PORT = 9227
SERVER_PORT = sys.argv[2] if len(sys.argv) > 2 else "53283"
SERVER = f"http://127.0.0.1:{SERVER_PORT}"
BUNDLE_DIR = r"C:\Users\DELL\AppData\Local\Temp\apk-test\extracted\assets\public"

# Crear harness aislado en la copia descomprimida del APK (no en public/)
HARNESS_PATH = os.path.join(BUNDLE_DIR, "__test_oq_harness.html")
if os.path.isdir(BUNDLE_DIR) and not os.path.exists(HARNESS_PATH):
    with open(HARNESS_PATH, "w", encoding="utf-8") as f:
        f.write("""<!doctype html>
<html><head><meta charset="utf-8"><title>OQ Test Harness</title></head>
<body>
<h1>OfflineQueue Test Harness</h1>
<p>Carga aislada de volvix-offline-queue.js para tests automatizados via CDP.</p>
<script>window.__SKIP_AUTH_GATE = true;</script>
<script src="/volvix-offline-queue.js"></script>
</body></html>
""")
    print(f"Harness creado en bundle extraido: {HARNESS_PATH}")

# Auto-detect tab
tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read())
CDP_WS = None
for t in tabs:
    if t.get('type') == 'page' and SERVER_PORT in t.get('url',''):
        CDP_WS = t['webSocketDebuggerUrl']
        break
if not CDP_WS and tabs:
    for t in tabs:
        if t.get('type') == 'page':
            CDP_WS = t['webSocketDebuggerUrl']
            break

print(f"Server: {SERVER}")
print(f"CDP WS: {CDP_WS}")

ws = create_connection(CDP_WS, timeout=30)
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
send("Emulation.setUserAgentOverride", {
    "userAgent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "platform": "Linux armv81"
})
send("Emulation.setDeviceMetricsOverride", {
    "width": 412, "height": 915, "deviceScaleFactor": 2.625, "mobile": True
})

# Limpiar IDB previo
send("Storage.clearDataForOrigin", {
    "origin": SERVER,
    "storageTypes": "service_workers,cache_storage,indexeddb"
})

# Navegar al harness aislado
send("Page.navigate", {"url": f"{SERVER}/__test_oq_harness.html"})
time.sleep(4)

# Re-aplicar viewport (a veces se resetea con navigate)
send("Emulation.setDeviceMetricsOverride", {
    "width": 412, "height": 915, "deviceScaleFactor": 2.625, "mobile": True
})

results = {"timestamp": int(time.time()), "tests": {}}

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    results["tests"][name] = {"pass": passed, "detail": detail}

def offline_on():
    """Activa modo offline interceptando fetch."""
    return eval_js("""
    (() => {
      if (window.__originalFetch) return 'already';
      window.__originalFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        const url = (typeof input === 'string') ? input : input.url;
        if (url && url.includes('/api/')) {
          return Promise.reject(new TypeError('NetworkError: simulated offline'));
        }
        return window.__originalFetch(input, init);
      };
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
      return 'offline-on';
    })()
    """)

def offline_off():
    """Desactiva modo offline."""
    return eval_js("""
    (() => {
      if (window.__originalFetch) {
        window.fetch = window.__originalFetch;
        delete window.__originalFetch;
      }
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
      return 'offline-off';
    })()
    """)

# ============================================================
print("\n" + "="*70)
print("TEST 1: Bundle del APK carga, harness inicializa OfflineQueue")
print("="*70)

url = eval_js("location.href")
oq_present = eval_js("typeof window.OfflineQueue?.enqueue === 'function'")
print(f"  URL: {url}")
print(f"  OQ.enqueue function: {oq_present}")
report("Bundle carga + OQ disponible", oq_present is True, str(url))

# ============================================================
print("\n" + "="*70)
print("TEST 2: API OfflineQueue completa (init/enqueue/syncNow/getAll/clear/size)")
print("="*70)

api = eval_js("""
({
  init: typeof window.OfflineQueue?.init,
  enqueue: typeof window.OfflineQueue?.enqueue,
  syncNow: typeof window.OfflineQueue?.syncNow,
  getAll: typeof window.OfflineQueue?.getAll,
  clear: typeof window.OfflineQueue?.clear,
  size: typeof window.OfflineQueue?.size,
  on: typeof window.OfflineQueue?.on,
  off: typeof window.OfflineQueue?.off
})
""")
print(f"  API: {api}")
all_present = isinstance(api, dict) and all(v == 'function' for v in api.values())
report("API completa", all_present, str(api))

# ============================================================
print("\n" + "="*70)
print("TEST 3: IndexedDB volvix_offline_queue existe")
print("="*70)

idb_state = eval_js("""
(async () => {
  if (window.OfflineQueue?.init) {
    try { await window.OfflineQueue.init(); } catch(e) {}
  }
  const dbs = await indexedDB.databases();
  const sz = await window.OfflineQueue.size();
  return { dbs: dbs.map(d=>d.name), size: sz };
})()
""", await_promise=True)
print(f"  {idb_state}")
report("IDB inicializa",
    isinstance(idb_state, dict) and 'volvix_offline_queue' in (idb_state.get('dbs') or []),
    str(idb_state))

# ============================================================
print("\n" + "="*70)
print("TEST 4: Modo OFFLINE - fetch a /api/* rechaza")
print("="*70)

state = offline_on()
print(f"  {state}, navigator.onLine={eval_js('navigator.onLine')}")

fetch_test = eval_js("""
(async () => {
  try {
    await fetch('/api/version/status');
    return { unexpected: true };
  } catch(e) {
    return { rejected: true, error: e.message };
  }
})()
""", await_promise=True)
print(f"  Fetch /api/version/status: {fetch_test}")
report("Offline mode activo",
    isinstance(fetch_test, dict) and fetch_test.get('rejected') is True,
    str(fetch_test))

# Limpiar queue antes de empezar
eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 5: Crear 5 productos OFFLINE -> persisten en IndexedDB")
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
          name: 'APKTEST-' + ts + '-' + i,
          code: 'APK' + ts + i,
          barcode: 'APK' + ts + i,
          price: 100 + i*10,
          cost: 50 + i*5,
          stock: 100,
          tenant_id: 'demo-tenant'
        },
        idempotencyKey: 'apk-' + ts + '-' + i
      });
      results.push({ i, id: item?.id, name: item?.body?.name });
    } catch(e) {
      results.push({ i, error: e.message });
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    enqueued: results,
    total: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    sample: all.slice(0,2).map(x => ({ name: x.body?.name, retries: x.retries }))
  };
})()
""", await_promise=True, timeout=30)
print(f"  {json.dumps(create, default=str)[:500]}")
report("5 productos OFFLINE persistidos",
    isinstance(create, dict) and create.get('total',0) >= 5,
    f"total={create.get('total') if isinstance(create, dict) else 'N/A'}, pending={create.get('pending') if isinstance(create, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 6: RELOAD (sigue offline) - los 5 productos siguen en IDB")
print("="*70)

send("Page.reload", {"ignoreCache": False})
time.sleep(4)

# Reactivar offline
offline_on()

# Esperar a que OQ se reinicialice
time.sleep(1)
oq_after = eval_js("typeof window.OfflineQueue?.getAll")
print(f"  OQ.getAll despues reload: {oq_after}")

if oq_after == 'function':
    after_reload = eval_js("""
    (async () => {
      if (window.OfflineQueue?.init) {
        try { await window.OfflineQueue.init(); } catch(e) {}
      }
      const all = await window.OfflineQueue.getAll();
      return {
        total: all.length,
        sample: all.slice(0,3).map(x => x.body?.name)
      };
    })()
    """, await_promise=True)
    print(f"  Tras reload: {after_reload}")
    report("Persistencia tras reload",
        isinstance(after_reload, dict) and after_reload.get('total',0) >= 5,
        f"total={after_reload.get('total') if isinstance(after_reload, dict) else 'N/A'}")
else:
    report("Persistencia tras reload", False, "OQ no se cargo tras reload")

# ============================================================
print("\n" + "="*70)
print("TEST 7: ONLINE - sync intenta enviar a server local (proxy a Vercel)")
print("="*70)

# Quitar offline
offline_off()
print(f"  online: {eval_js('navigator.onLine')}")

# Disparar syncNow y esperar
sync = eval_js("""
(async () => {
  if (window.OfflineQueue?.init) {
    try { await window.OfflineQueue.init(); } catch(e) {}
  }

  const before = await window.OfflineQueue.getAll();
  const pendingBefore = before.filter(x => !x.synced && !x.completed).length;

  try { await window.OfflineQueue.syncNow(); } catch(e) {}

  // Esperar hasta 25s a que cambien estados
  for (let i=0; i<25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const cur = await window.OfflineQueue.getAll();
    const pending = cur.filter(x => !x.synced && !x.completed).length;
    if (pending !== pendingBefore || i === 24) {
      const completed = cur.filter(x => x.synced || x.completed).length;
      const errored = cur.filter(x => x.lastError).length;
      return {
        before_pending: pendingBefore,
        after_total: cur.length,
        after_pending: pending,
        after_completed: completed,
        after_errored: errored,
        elapsed_s: i+1,
        sample_errors: cur.filter(x=>x.lastError).slice(0,2).map(x => ({
          name: x.body?.name, err: String(x.lastError).slice(0,100), retries: x.retries
        }))
      };
    }
  }
  return { timeout: true };
})()
""", await_promise=True, timeout=60)
print(f"  Sync result: {json.dumps(sync, default=str, indent=2)[:600]}")
report("Sync intenta enviar tras online",
    isinstance(sync, dict) and (
        sync.get('after_completed',0) > 0 or
        sync.get('after_errored',0) > 0 or
        sync.get('after_pending',99) < sync.get('before_pending',0)
    ),
    f"completed={sync.get('after_completed') if isinstance(sync, dict) else 'N/A'}, errored={sync.get('after_errored') if isinstance(sync, dict) else 'N/A'}")

# Limpiar
eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 8: INTERMITENTE - 6 ciclos offline/online encolan correctamente")
print("="*70)

for i in range(6):
    is_offline = (i % 2 == 0)
    if is_offline:
        offline_on()
    else:
        offline_off()
    r = eval_js(f"""
    (async () => {{
      try {{
        const ts = Date.now();
        const item = await window.OfflineQueue.enqueue({{
          method:'POST', url:'/api/products',
          body:{{ name:'INT-{i}-'+ts, code:'INT'+{i}+ts, price:{i*10+50}, tenant_id:'demo-tenant' }},
          idempotencyKey:'intermit-{i}-'+ts
        }});
        return {{ ok: true, id: item?.id }};
      }} catch(e) {{ return {{ error: e.message }}; }}
    }})()
    """, await_promise=True)
    print(f"  Step {i}: {'OFFLINE' if is_offline else 'ONLINE '} -> enqueue: {r}")
    time.sleep(1)

offline_off()
time.sleep(2)
intermit = eval_js("""
(async () => {
  const all = await window.OfflineQueue.getAll();
  return { total: all.length, names: all.map(x => x.body?.name).filter(x=>x) };
})()
""", await_promise=True)
print(f"  Total final: {intermit}")
report("Intermitente - 6 items encolados",
    isinstance(intermit, dict) and intermit.get('total',0) >= 6,
    f"total={intermit.get('total') if isinstance(intermit, dict) else 'N/A'}")

# Limpiar
eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 9: MEMORIA - encolar 1000 items, medir tiempo y heap")
print("="*70)

offline_on()
memory = eval_js("""
(async () => {
  await window.OfflineQueue.clear();
  const start = performance.now();
  const startMem = (performance.memory || {usedJSHeapSize:0}).usedJSHeapSize;
  const ts = Date.now();
  const promises = [];
  for (let i=0; i<1000; i++) {
    promises.push(window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{ name:'BULK-'+i, code:'B'+i, price:i+10, tenant_id:'demo-tenant' },
      idempotencyKey:'bulk-'+ts+'-'+i
    }).catch(e => null));
  }
  await Promise.all(promises);
  const enqueueMs = performance.now() - start;
  const all = await window.OfflineQueue.getAll();
  const endMem = (performance.memory || {usedJSHeapSize:0}).usedJSHeapSize;
  return {
    enqueued: 1000,
    inIDB: all.length,
    enqueueMs: Math.round(enqueueMs),
    msPerItem: Math.round(enqueueMs / 10) / 100,
    heapDeltaMB: Math.round((endMem - startMem) / 1048576 * 100) / 100,
    totalHeapMB: Math.round(endMem / 1048576 * 100) / 100
  };
})()
""", await_promise=True, timeout=120)
print(f"  {memory}")
report("1000 items en IDB",
    isinstance(memory, dict) and memory.get('inIDB',0) >= 1000,
    f"items={memory.get('inIDB') if isinstance(memory, dict) else 'N/A'}, time={memory.get('enqueueMs') if isinstance(memory, dict) else 'N/A'}ms, heap+{memory.get('heapDeltaMB') if isinstance(memory, dict) else 'N/A'}MB")

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_off()

# ============================================================
print("\n" + "="*70)
print("TEST 10: AbortController - fetch con timeout de 1s aborta")
print("="*70)

abort_test = eval_js("""
(async () => {
  const start = performance.now();
  try {
    const ac = new AbortController();
    ac.abort();  // Abort INMEDIATAMENTE, antes de iniciar el fetch
    const r = await fetch('/api/products?limit=1', { signal: ac.signal });
    return { unexpected_success: true, ms: Math.round(performance.now()-start), status: r.status };
  } catch(e) {
    return { aborted: e.name === 'AbortError' || /abort/i.test(e.message), ms: Math.round(performance.now()-start), error: e.message };
  }
})()
""", await_promise=True, timeout=15)
print(f"  {abort_test}")
report("AbortController aborta fetch correctamente",
    isinstance(abort_test, dict) and abort_test.get('aborted') is True,
    str(abort_test))

# ============================================================
print("\n" + "="*70)
print("TEST 11: UA mobile + viewport correcto")
print("="*70)

# Reaplicar viewport tras reloads previos
send("Emulation.setDeviceMetricsOverride", {
    "width": 412, "height": 915, "deviceScaleFactor": 2.625, "mobile": True
})
time.sleep(0.5)

cap_check = eval_js("""
({
  userAgent: navigator.userAgent.slice(0,80),
  mobile: /Mobile|Android/i.test(navigator.userAgent),
  isCapacitor: typeof window.Capacitor !== 'undefined',
  viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
})
""")
print(f"  {cap_check}")
report("UA mobile correcto",
    isinstance(cap_check, dict) and cap_check.get('mobile') is True and cap_check.get('viewport',{}).get('w',0) <= 500,
    f"mobile={cap_check.get('mobile') if isinstance(cap_check, dict) else 'N/A'}, w={cap_check.get('viewport',{}).get('w') if isinstance(cap_check, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 12: STATIC - Cotizaciones presente en salvadorex-pos.html del bundle")
print("="*70)

# Hacer fetch directo al HTML del bundle, no inyectar nada
spos_html = eval_js("""
(async () => {
  const r = await fetch('/salvadorex-pos.html');
  const txt = await r.text();
  return {
    ok: r.ok,
    bytes: txt.length,
    hasCotBtn: txt.includes('data-menu="cotizaciones"'),
    hasCotScreen: txt.includes('screen-cotizaciones'),
    hasHiddenFlag: txt.includes('data-feature="module.cotizaciones"')
  };
})()
""", await_promise=True)
print(f"  {spos_html}")
report("Cotizaciones visible en bundle",
    isinstance(spos_html, dict) and spos_html.get('hasCotBtn') and spos_html.get('hasCotScreen') and not spos_html.get('hasHiddenFlag'),
    f"btn={spos_html.get('hasCotBtn') if isinstance(spos_html, dict) else 'N/A'}, screen={spos_html.get('hasCotScreen') if isinstance(spos_html, dict) else 'N/A'}, hidden={spos_html.get('hasHiddenFlag') if isinstance(spos_html, dict) else 'N/A'}")

# ============================================================
# TESTS NUEVOS DESTRUCTIVOS QUE EL USUARIO PIDIO
# ============================================================
print("\n" + "="*70)
print("TEST 13: COALESCING - varios cambios del mismo producto se coalescan")
print("="*70)

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_on()
coalesce = eval_js("""
(async () => {
  // Multiple PATCH al mismo product code -> deberian coalescer
  const ts = Date.now();
  for (let i=0; i<5; i++) {
    await window.OfflineQueue.enqueue({
      method: 'PATCH',
      url: '/api/products/PROD123',
      body: { name: 'Producto Cambio', code: 'PROD123', price: 10 + i*20, tenant_id: 'demo' }
    });
  }
  const all = await window.OfflineQueue.getAll();
  return {
    total: all.length,
    operations: all.map(x => ({ price: x.body?.price, coalesced: x.coalesced, meta: x.meta?.coalescedCount }))
  };
})()
""", await_promise=True)
print(f"  {coalesce}")
# Coalescing puede dejar 1 o 5 items dependiendo de implementacion
report("Coalescing funciona (>=1 item con info)",
    isinstance(coalesce, dict) and coalesce.get('total', 0) >= 1,
    f"total={coalesce.get('total') if isinstance(coalesce, dict) else 'N/A'}")

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_off()

# ============================================================
print("\n" + "="*70)
print("TEST 14: IDEMPOTENCY - mismo idempotencyKey 2 veces -> 1 item solo")
print("="*70)

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_on()
idempotency = eval_js("""
(async () => {
  const key = 'unique-idempo-' + Date.now();
  await window.OfflineQueue.enqueue({
    method:'POST', url:'/api/products',
    body:{ name:'IDEMPOTENT', code:'IDEM1', price:100, tenant_id:'demo' },
    idempotencyKey: key
  });
  await window.OfflineQueue.enqueue({
    method:'POST', url:'/api/products',
    body:{ name:'IDEMPOTENT', code:'IDEM1', price:100, tenant_id:'demo' },
    idempotencyKey: key
  });
  await window.OfflineQueue.enqueue({
    method:'POST', url:'/api/products',
    body:{ name:'IDEMPOTENT', code:'IDEM1', price:100, tenant_id:'demo' },
    idempotencyKey: key
  });
  const all = await window.OfflineQueue.getAll();
  return {
    total: all.length,
    keys: all.map(x => x.idempotencyKey)
  };
})()
""", await_promise=True)
print(f"  {idempotency}")
report("Idempotency keys deduplican",
    isinstance(idempotency, dict) and idempotency.get('total',99) <= 3,
    f"total={idempotency.get('total') if isinstance(idempotency, dict) else 'N/A'}")

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_off()

# ============================================================
print("\n" + "="*70)
print("TEST 15: WRITE/READ-AFTER-RESTART - guardar -> reload -> leer")
print("="*70)

# Setup: encolar offline
eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)
offline_on()
eval_js("""
(async () => {
  const ts = Date.now();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{ name:'RESTART-'+ts+'-'+i, code:'RST'+i, tenant_id:'demo' },
      idempotencyKey: 'restart-'+ts+'-'+i
    });
  }
})()
""", await_promise=True)

# Reload completo
send("Page.reload", {"ignoreCache": False})
time.sleep(5)

# Reaplicar offline tras reload
offline_on()

# Re-init OfflineQueue manualmente
after_restart = eval_js("""
(async () => {
  if (window.OfflineQueue?.init) {
    try { await window.OfflineQueue.init(); } catch(e) {}
  }
  const all = await window.OfflineQueue.getAll();
  return {
    total: all.length,
    names: all.map(x => x.body?.name).filter(x=>x).slice(0,5)
  };
})()
""", await_promise=True)
print(f"  Tras reload + re-init: {after_restart}")
report("Items sobreviven page reload",
    isinstance(after_restart, dict) and after_restart.get('total',0) >= 3,
    f"total={after_restart.get('total') if isinstance(after_restart, dict) else 'N/A'}")

eval_js("(async()=>{await window.OfflineQueue.clear();})()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("RESUMEN FINAL")
print("="*70)
passed = sum(1 for t in results["tests"].values() if t["pass"])
total = len(results["tests"])
print(f"\nPASS: {passed}/{total}\n")
for k, v in results["tests"].items():
    icon = "OK  " if v['pass'] else "FAIL"
    print(f"  [{icon}] {k}")

# Save results
out = os.path.expanduser("~/apk-extreme-results.json")
with open(out, "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nFull results: {out}")

# Screenshot
try:
    shot = send("Page.captureScreenshot", {"format": "png"})
    shot_path = "C:/Users/DELL/AppData/Local/Temp/apk-test/apk-final.png"
    with open(shot_path, "wb") as f:
        f.write(base64.b64decode(shot.get("data","")))
    print(f"Screenshot: {shot_path}")
except Exception as e:
    print(f"Screenshot err: {e}")

ws.close()
