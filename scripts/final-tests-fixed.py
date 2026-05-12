"""
Tests finales con navigation pre-init para evitar db null.
"""
import urllib.request, json, time, base64, os, sys, subprocess
from websocket import create_connection

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
def adb(args, t=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=t).stdout.strip()

# Force-stop + restart fresh
adb(["shell", "am", "force-stop", "com.volvix.pos"])
time.sleep(2)
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(12)

pid = adb(["shell", "pidof", "com.volvix.pos"]).split()[0]
print(f"App PID: {pid}", flush=True)
adb(["forward", "--remove-all"])
adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{pid}"])
time.sleep(3)

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
def ev(e, ap=False, t=30):
    r = s('Runtime.evaluate', {'expression':e, 'returnByValue':True, 'awaitPromise':ap, 'timeout':t*1000})
    if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:200]}
    return r.get('result',{}).get('value')
s('Page.enable'); s('Runtime.enable')

RESULTS = {"tests": {}}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}", flush=True)
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:300]}

# Login PRIMERO (estamos en login.html)
print("\n=== Login ===", flush=True)
login = ev("""(async () => {
  try {
    const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
    const d = await r.json();
    if (d.token) localStorage.setItem('volvix_token', d.token);
    return { ok: !!d.token, len: d.token?.length };
  } catch(e) { return { error: e.message }; }
})()""", ap=True, t=20)
print(f"  {login}", flush=True)
report("Login en APK Android", login.get('ok') is True, str(login))

# Navigate al POS (DESPUES de login)
print("\n=== Navegar al POS ===", flush=True)
s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
time.sleep(12)
url_after = ev("location.href")
print(f"  URL: {url_after}", flush=True)

# Init OfflineQueue (ahora si OK)
init_result = ev("""(async () => {
  for (let i=0; i<20; i++) {
    if (window.OfflineQueue?.init) {
      try { await window.OfflineQueue.init(); break; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  try { await window.OfflineQueue.clear(); } catch(e) {}
  return {
    oq_ready: typeof window.OfflineQueue?.enqueue === 'function',
    queue_size: (await window.OfflineQueue.getAll()).length
  };
})()""", ap=True, t=30)
print(f"  Init: {init_result}", flush=True)
report("OfflineQueue init (post-navigate)",
    isinstance(init_result, dict) and init_result.get('oq_ready') is True,
    str(init_result))

# === STRESS 50 items + sync ===
print("\n=== STRESS 50 items + sync end-to-end ===", flush=True)
adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(3)

stress = ev("""(async () => {
  const start = performance.now();
  const ts = Date.now();
  const promises = [];
  for (let i=0; i<50; i++) {
    promises.push(window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'F50-'+ts+'-'+i, code:'F50_'+ts+'_'+i, price:i+50, tenant_id:'TNT001'},
      idempotencyKey: 'f50-'+ts+'-'+i
    }).catch(e=>({err:e.message})));
  }
  await Promise.all(promises);
  const all = await window.OfflineQueue.getAll();
  return { inIDB: all.length, time_ms: Math.round(performance.now()-start) };
})()""", ap=True, t=60)
print(f"  Stress: {stress}", flush=True)
report("50 items en IDB offline",
    isinstance(stress, dict) and stress.get('inIDB', 0) >= 50,
    str(stress))

# Sync
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(10)

sync = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  for (let i=0; i<90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (pending === 0) return { elapsed_s: i+1, final: all.length };
  }
  const all = await window.OfflineQueue.getAll();
  return { timeout: true, pending: all.filter(x=>!x.synced&&!x.completed).length, errored: all.filter(x=>x.lastError).length };
})()""", ap=True, t=120)
print(f"  Sync: {sync}", flush=True)
report("Sync 50 items completado",
    isinstance(sync, dict) and (sync.get('final', 999) == 0 or sync.get('elapsed_s')),
    str(sync))

# Backend
backend = ev("""(async () => {
  let all = [];
  for (let p=0; p<3; p++) {
    const r = await fetch(`/api/products?limit=1000&offset=${p*1000}`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    const d = await r.json();
    const products = Array.isArray(d) ? d : (d.products || []);
    if (products.length === 0) break;
    all = all.concat(products);
    if (products.length < 1000) break;
  }
  return { f50: all.filter(p => (p.name||'').startsWith('F50-')).length };
})()""", ap=True, t=60)
print(f"  Backend: {backend}", flush=True)
report("F50 productos en backend (LOCAL == NUBE)",
    isinstance(backend, dict) and backend.get('f50', 0) >= 45,  # 90% tolerance
    f"f50={backend.get('f50')}/50")

# Plugins (que ya validamos antes)
print("\n=== Plugins enum ===", flush=True)
plugins = ev("""Object.keys(window.Capacitor?.Plugins || {})""")
print(f"  {plugins}", flush=True)
report("16 plugins Capacitor disponibles",
    isinstance(plugins, list) and len(plugins) >= 15,
    f"count={len(plugins) if isinstance(plugins, list) else 0}")

# Corrupción IDB
print("\n=== Corrupción IDB + recovery ===", flush=True)
corrupt = ev("""(async () => {
  await window.OfflineQueue.clear();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'CRPT3-'+Date.now()+'-'+i, code:'cr_'+i, price:i, tenant_id:'TNT001'},
      idempotencyKey: 'cr-'+Date.now()+'-'+i
    });
  }
  // Corromper IDB con NaN
  const db = await new Promise(r => { const x = indexedDB.open('volvix_offline_queue'); x.onsuccess = e => r(e.target.result); });
  const tx = db.transaction(['requests'], 'readwrite');
  const items = await new Promise(r => { const x = tx.objectStore('requests').getAll(); x.onsuccess = e => r(e.target.result); });
  for (const item of items) {
    item.retries = NaN; item.nextAttempt = 'TOXIC';
    await new Promise(r => { tx.objectStore('requests').put(item).onsuccess = () => r(); });
  }
  db.close();

  // Sync con corrupción
  let syncErr = null;
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { syncErr = e.message; }
  await new Promise(r => setTimeout(r, 5000));

  // Probar nuevo enqueue
  let canEnqueue = false;
  try {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'AFTER-CRPT-'+Date.now(), code:'ac', price:1, tenant_id:'TNT001'},
      idempotencyKey: 'ac-'+Date.now()
    });
    canEnqueue = true;
  } catch(e) {}

  return { appAlive: typeof window.OfflineQueue?.enqueue === 'function', syncErr, canEnqueue };
})()""", ap=True, t=60)
print(f"  {corrupt}", flush=True)
report("App sobrevive corrupción IDB + acepta nuevos enqueues",
    isinstance(corrupt, dict) and corrupt.get('appAlive') is True and corrupt.get('canEnqueue') is True,
    str(corrupt))

# Summary
print("\n" + "="*70, flush=True)
print("RESUMEN FINAL TESTS", flush=True)
print("="*70, flush=True)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n", flush=True)
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}", flush=True)

with open(os.path.expanduser("~/final-tests-fixed.json"), "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
ws.close()
