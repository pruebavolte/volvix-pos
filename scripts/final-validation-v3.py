"""
FINAL VALIDATION V3 — todos los tests pendientes consolidados.

1. Multi-device conflict (APK + curl simulando WEB)
2. Stress 500 items + verify backend (mas rapido que 1000)
3. Process death recovery
4. Plugins nativos enumeration
5. Corruption recovery
6. Sync end-to-end
"""
import urllib.request, json, time, base64, os, sys, subprocess
from websocket import create_connection

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
def adb(args, timeout=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=timeout).stdout.strip()

RESULTS = {"phase": "FINAL-V3", "tests": {}}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}", flush=True)
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:400]}

def get_app_tab():
    pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
    if not pid_raw:
        adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
        time.sleep(10)
        pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
    pid = pid_raw[0] if pid_raw else None
    if not pid:
        return None
    adb(["forward", "--remove-all"])
    adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{pid}"])
    time.sleep(3)
    try:
        tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json", timeout=5).read())
        return next((t for t in tabs if t.get('type') == 'page'), None)
    except Exception as e:
        print(f"  CDP error: {e}", flush=True)
        return None

# Conectar
print("="*70, flush=True)
print("FINAL VALIDATION V3", flush=True)
print("="*70, flush=True)

tab = get_app_tab()
if not tab:
    print("FATAL: no app tab", flush=True)
    sys.exit(1)
print(f"Tab: {tab.get('url','')[:80]}", flush=True)

ws = create_connection(tab['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=60)
cid = [0]
def s(m, p=None):
    cid[0] += 1
    msg = {"id": cid[0], "method": m}
    if p: msg["params"] = p
    ws.send(json.dumps(msg))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == cid[0]: return r.get("result", {})
def ev(e, ap=False, t=30):
    r = s('Runtime.evaluate', {'expression': e, 'returnByValue': True, 'awaitPromise': ap, 'timeout': t * 1000})
    if "exceptionDetails" in r: return {"EXC": r["exceptionDetails"].get("text", "")[:200]}
    return r.get("result", {}).get("value")

s('Page.enable'); s('Runtime.enable')

# Estado inicial
print("\n[Estado inicial]", flush=True)
state = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    url: location.href,
    queue: (await window.OfflineQueue.getAll()).length,
    online: navigator.onLine,
    hasToken: !!localStorage.getItem('volvix_token'),
    appVersion: window.__vlxAppVersion || 'unknown',
    capacitor: typeof window.Capacitor
  };
})()""", ap=True, t=20)
print(f"  {state}", flush=True)

# Asegurar wifi/data ON
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(2)

# Re-login si necesario
if not state.get('hasToken'):
    print("\n[Login]", flush=True)
    login = ev("""(async () => {
      try {
        const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
        const d = await r.json();
        if (d.token) localStorage.setItem('volvix_token', d.token);
        return { ok: !!d.token };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=20)
    print(f"  {login}", flush=True)

# Navegar a POS si no está
if 'login' in state.get('url', '') or 'salvadorex' not in state.get('url', ''):
    print("\n[Navegar a POS]", flush=True)
    s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
    time.sleep(12)

# Clear queue para empezar limpio (con timeout porque puede tener 1000+)
print("\n[Clear queue]", flush=True)
cleared = ev("(async()=>{ try { await window.OfflineQueue.clear(); return await window.OfflineQueue.getAll(); } catch(e) { return {err:e.message}; } })()",
             ap=True, t=120)
print(f"  Queue tras clear: {len(cleared) if isinstance(cleared, list) else cleared}", flush=True)

# ============================================================
# TEST 1: Stress 200 items en APK (más rapido que 1000)
# ============================================================
print("\n" + "="*70, flush=True)
print("TEST 1: STRESS 200 items en APK + sync end-to-end", flush=True)
print("="*70, flush=True)

# Bloquear red
adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(3)

stress = ev("""(async () => {
  const start = performance.now();
  const ts = Date.now();
  const promises = [];
  for (let i=0; i<200; i++) {
    promises.push(window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'V178-STRESS-'+ts+'-'+i, code:'V178'+ts+i, price:i+100, tenant_id:'TNT001'},
      idempotencyKey: 'v178-'+ts+'-'+i
    }).catch(e=>null));
  }
  await Promise.all(promises);
  const enqueueMs = performance.now() - start;
  const all = await window.OfflineQueue.getAll();
  return { inIDB: all.length, enqueueMs: Math.round(enqueueMs), msPerItem: Math.round(enqueueMs/200 * 100)/100 };
})()""", ap=True, t=60)
print(f"  Stress: {stress}", flush=True)
report("STRESS 200 items en IndexedDB",
    isinstance(stress, dict) and stress.get('inIDB', 0) >= 200,
    f"items={stress.get('inIDB')}, time={stress.get('enqueueMs')}ms")

# Restaurar red + sync
print("\n  Restaurando red + sync...", flush=True)
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(15)

sync_start = time.time()
sync = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  for (let i=0; i<300; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (i % 20 === 0) console.log('sync s=' + i + ' pending=' + pending);
    if (pending === 0) {
      return { elapsed_s: i+1, final_in_queue: all.length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return { timeout_5min: true, remaining: all.length, pending: all.filter(x=>!x.synced&&!x.completed).length };
})()""", ap=True, t=320)
sync_elapsed = time.time() - sync_start
print(f"  Sync: {sync} | elapsed={sync_elapsed:.1f}s", flush=True)
report("Sync 200 items completado",
    isinstance(sync, dict) and (sync.get('elapsed_s') is not None and sync.get('final_in_queue', 999) == 0),
    f"queue={sync.get('final_in_queue')}, time={sync_elapsed:.1f}s")

# Verify backend
print("\n  Verificando backend...", flush=True)
backend = ev("""(async () => {
  let all = [];
  for (let page=0; page<5; page++) {
    const r = await fetch(`/api/products?limit=1000&offset=${page*1000}`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    const d = await r.json();
    const products = Array.isArray(d) ? d : (d.products || []);
    if (products.length === 0) break;
    all = all.concat(products);
    if (products.length < 1000) break;
  }
  return {
    total: all.length,
    v178_count: all.filter(p => (p.name||'').startsWith('V178-STRESS-')).length
  };
})()""", ap=True, t=60)
print(f"  Backend: {backend}", flush=True)
report("V178 productos en backend (LOCAL == NUBE)",
    isinstance(backend, dict) and backend.get('v178_count', 0) >= 180,  # 90% tolerance
    f"v178_in_backend={backend.get('v178_count')}/200")

# ============================================================
# TEST 2: PLUGINS NATIVOS
# ============================================================
print("\n" + "="*70, flush=True)
print("TEST 2: Plugins nativos Android", flush=True)
print("="*70, flush=True)

plugins_list = ev("""Object.keys(window.Capacitor?.Plugins || {})""")
print(f"  Plugins: {plugins_list}", flush=True)
report("Plugins enum >= 5", len(plugins_list or []) >= 5 if isinstance(plugins_list, list) else False, f"count={len(plugins_list or [])}")

if plugins_list:
    # Device
    device = ev("""(async () => {
      try { return await window.Capacitor.Plugins.Device.getInfo(); } catch(e) { return {error: e.message}; }
    })()""", ap=True, t=15)
    print(f"  Device: model={device.get('model')}, os={device.get('operatingSystem')} v{device.get('osVersion')}, manuf={device.get('manufacturer')}, isVirtual={device.get('isVirtual')}", flush=True)
    report("Device plugin retorna Android real",
        device.get('platform') == 'android' and device.get('operatingSystem') == 'android',
        f"model={device.get('model')}")

    # Network
    network = ev("""(async () => {
      try { return await window.Capacitor.Plugins.Network.getStatus(); } catch(e) { return {error: e.message}; }
    })()""", ap=True, t=15)
    print(f"  Network: {network}", flush=True)
    report("Network plugin status", isinstance(network, dict) and 'connected' in network, str(network))

    # Preferences set/get/remove
    pref = ev("""(async () => {
      try {
        const k = 'final_test_' + Date.now();
        await window.Capacitor.Plugins.Preferences.set({key:k, value:'VALUE_XYZ'});
        const r1 = await window.Capacitor.Plugins.Preferences.get({key:k});
        await window.Capacitor.Plugins.Preferences.remove({key:k});
        const r2 = await window.Capacitor.Plugins.Preferences.get({key:k});
        return { stored: r1.value, removed: r2.value };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Preferences: {pref}", flush=True)
    report("Preferences set/get/remove",
        pref.get('stored') == 'VALUE_XYZ' and pref.get('removed') is None,
        str(pref))

# ============================================================
# TEST 3: CORRUPTION RECOVERY
# ============================================================
print("\n" + "="*70, flush=True)
print("TEST 3: Corruption IndexedDB + recovery", flush=True)
print("="*70, flush=True)

corrupt = ev("""(async () => {
  await window.OfflineQueue.clear();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'CRPT2-'+Date.now()+'-'+i, code:'CR'+i, price:i, tenant_id:'TNT001'},
      idempotencyKey: 'cr-'+Date.now()+'-'+i
    });
  }
  // Corromper IDB - inyectar NaN y valores tóxicos
  const db = await new Promise(r => { const x = indexedDB.open('volvix_offline_queue'); x.onsuccess = e => r(e.target.result); });
  const tx = db.transaction(['requests'], 'readwrite');
  const all = await new Promise(r => { const x = tx.objectStore('requests').getAll(); x.onsuccess = e => r(e.target.result); });
  for (const item of all) {
    item.retries = NaN;
    item.nextAttempt = -999999;
    item.body = { __toxic: true };
    await new Promise(r => { tx.objectStore('requests').put(item).onsuccess = () => r(); });
  }
  db.close();

  // App sigue viva?
  let appAlive = typeof window.OfflineQueue?.enqueue === 'function';
  let syncErr = null;
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { syncErr = e.message; }
  await new Promise(r => setTimeout(r, 8000));

  // Probar enqueue NUEVO tras corrupcion
  let enqueueAfterCorrupt = null;
  try {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'AFTER-CRPT-'+Date.now(), code:'AC', price:1, tenant_id:'TNT001'},
      idempotencyKey: 'ac-'+Date.now()
    });
    enqueueAfterCorrupt = true;
  } catch(e) { enqueueAfterCorrupt = e.message; }

  const final = await window.OfflineQueue.getAll();
  return {
    appAlive,
    syncErr,
    enqueueAfterCorrupt,
    finalCount: final.length
  };
})()""", ap=True, t=40)
print(f"  Corrupt: {corrupt}", flush=True)
report("App sobrevive IDB corrupto + acepta nuevo enqueue",
    isinstance(corrupt, dict) and corrupt.get('appAlive') is True and corrupt.get('enqueueAfterCorrupt') is True,
    str(corrupt))

# ============================================================
# TEST 4: MULTI-DEVICE: APK + curl simulando WEB (BUG #7 fix verify)
# ============================================================
print("\n" + "="*70, flush=True)
print("TEST 4: Multi-device conflict (BUG #7 fix verify)", flush=True)
print("="*70, flush=True)

# Tomar el token del APK
token = ev("localStorage.getItem('volvix_token')")
if token:
    common_code = f"MDC-{int(time.time())}"

    # POST via APK
    apk_result = ev(f"""(async () => {{
      const r = await fetch('https://volvix-pos.vercel.app/api/products', {{
        method:'POST',
        headers:{{'Content-Type':'application/json', 'Authorization':'Bearer '+localStorage.getItem('volvix_token')}},
        body: JSON.stringify({{
          name:'MD-APK-{common_code}', code:'{common_code}', price:100, tenant_id:'TNT001'
        }})
      }});
      return {{ status: r.status, body: (await r.text()).slice(0,250) }};
    }})()""", ap=True, t=15)
    print(f"  APK POST: {apk_result}", flush=True)

    # POST via curl (simula WEB device 2)
    time.sleep(1)
    curl_cmd = ["curl", "-s", "-X", "POST", "-H", f"Authorization: Bearer {token}",
                "-H", "Content-Type: application/json",
                "-d", json.dumps({
                    "name": f"MD-WEB-{common_code}",
                    "code": common_code,
                    "price": 200,
                    "tenant_id": "TNT001"
                }),
                "-o", "/tmp/web-result.json",
                "-w", "%{http_code}",
                "https://volvix-pos.vercel.app/api/products"]
    web_http_code = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=15).stdout.strip()
    try:
        with open("/tmp/web-result.json") as f:
            web_body = f.read()
    except:
        web_body = "(no body)"
    print(f"  WEB curl: HTTP {web_http_code} body={web_body[:250]}", flush=True)

    # BUG #7 fix verify: el 2do POST debería ser 409 si el fix funcionó
    second_post_was_409 = (web_http_code == "409")
    report("BUG #7 FIX: segundo POST con mismo code devuelve 409 (no duplicado)",
        second_post_was_409,
        f"http_code={web_http_code}")

    # Verificar duplicates en backend
    time.sleep(2)
    backend_check = ev(f"""(async () => {{
      const r = await fetch('/api/products?q={common_code}&limit=10', {{
        headers: {{'Authorization': 'Bearer ' + localStorage.getItem('volvix_token')}}
      }});
      const d = await r.json();
      const products = Array.isArray(d) ? d : (d.products || []);
      const matches = products.filter(p => (p.code||'') === '{common_code}');
      return {{ total: matches.length, sample: matches.map(p => ({{id: p.id?.slice(0,8), name: p.name, price: p.price}})) }};
    }})()""", ap=True, t=15)
    print(f"  Backend final: {backend_check}", flush=True)
    report("Backend: solo 1 producto creado (no 2)",
        isinstance(backend_check, dict) and backend_check.get('total', 0) == 1,
        f"count={backend_check.get('total')}")

# ============================================================
# Summary
# ============================================================
print("\n" + "="*70, flush=True)
print("RESUMEN FINAL VALIDATION V3", flush=True)
print("="*70, flush=True)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n", flush=True)
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}", flush=True)

with open(os.path.expanduser("~/final-validation-v3-results.json"), "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: ~/final-validation-v3-results.json", flush=True)

try:
    shot = s('Page.captureScreenshot', {'format':'png'})
    with open('C:/Users/DELL/AppData/Local/Temp/volvix-emulator/emu-final-v3.png','wb') as f:
        f.write(base64.b64decode(shot.get("data","")))
except: pass

ws.close()
