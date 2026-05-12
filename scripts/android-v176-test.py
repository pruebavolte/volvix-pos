"""FULL E2E test con APK v1.0.176 (todos los bug fixes aplicados)."""
import urllib.request, json, time, base64, os
from websocket import create_connection
import subprocess

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
def adb(args, timeout=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=timeout).stdout.strip()

tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab = next((t for t in tabs if t.get('type') == 'page'), None)
print(f"Tab: {tab.get('url','')[:80]}")
ws = create_connection(tab['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=30)
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

s('Page.enable'); s('Runtime.enable'); s('Network.enable')

RESULTS = {"tests": {}}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:300]}

print("="*70)
print("APK v1.0.176 - END-TO-END en emulador Android 14 REAL")
print("="*70)

# Login
print("\n[1] Login...")
login_js = """(async () => {
  try {
    const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
    const d = await r.json();
    if (d.token) {
      localStorage.setItem('volvix_token', d.token);
      localStorage.setItem('volvixAuthToken', d.token);
      return { ok: true };
    }
    return { status: r.status };
  } catch(e) { return { error: e.message }; }
})()"""
login = ev(login_js, ap=True)
report("Login en APK Android real", login.get('ok') is True, str(login))

# Nav POS
print("\n[2] Navegando POS...")
s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
time.sleep(12)

# BUG #6 test
print("\n[3] TEST BUG #6 FIX: enqueue sin Authorization (debe leer de localStorage)...")
test6_js = """(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  await window.OfflineQueue.clear();
  const ts = Date.now();
  await window.OfflineQueue.enqueue({
    method:'POST', url:'/api/products',
    body:{name:'V176-NOAUTH-'+ts, code:'V176N'+ts, price:777, tenant_id:'TNT001'},
    idempotencyKey: 'v176n-'+ts
  });
  try { await window.OfflineQueue.syncNow(); } catch(e) {}
  for (let i=0; i<30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    if (all.filter(x => !x.synced && !x.completed).length === 0) {
      return { elapsed_s: i+1, completed: all.filter(x=>x.synced||x.completed).length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return { timeout: true, sample: all.slice(0,1).map(x=>({n:x.body?.name, r:x.retries, e: String(x.lastError||'').slice(0,80)})) };
})()"""
t6 = ev(test6_js, ap=True, t=60)
report("BUG #6 fix: auth auto-leido", t6.get('completed', 0) > 0, str(t6))

# Backend check
backend_v176 = ev("""(async () => {
  const r = await fetch('/api/products?limit=20', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') } });
  const d = await r.json();
  const products = Array.isArray(d) ? d : (d.products || []);
  return { v176: products.filter(p => (p.name||'').startsWith('V176-NOAUTH-')).length };
})()""", ap=True)
report("V176-NOAUTH llego al backend", backend_v176.get('v176', 0) > 0, str(backend_v176))

# BUG #1 test
print("\n[4] TEST BUG #1 FIX: 80s offline + items NO se eliminan...")
adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(5)

ev("""(async () => {
  await window.OfflineQueue.clear();
  const ts = Date.now();
  for (let i=0; i<10; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'OFFLINE80-'+ts+'-'+i, code:'O8'+ts+i, price:i*10+100, tenant_id:'TNT001'},
      idempotencyKey: 'o8-'+ts+'-'+i
    });
  }
})()""", ap=True, t=20)
print("  10 items encolados, esperando 80s con syncNow cada 10s...")
for _ in range(8):
    ev("(async()=>{ try { await window.OfflineQueue.syncNow(); } catch(e) {} })()", ap=True, t=15)
    time.sleep(10)

after80 = ev("""(async () => {
  const all = await window.OfflineQueue.getAll();
  return { total: all.length, retries_max: Math.max(...all.map(x=>x.retries||0)) };
})()""", ap=True)
print(f"  Tras 80s offline: {after80}")
report("BUG #1 fix: 10 items sobreviven 80s offline", after80.get('total', 0) >= 10, str(after80))

# BUG #2 test
print("\n[5] TEST BUG #2 FIX: restaurar + syncNow({force:true})...")
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(15)

sync_force = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { return {syncErr: e.message}; }
  for (let i=0; i<60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    if (all.filter(x => !x.synced && !x.completed).length === 0) {
      return { elapsed_s: i+1, completed: all.filter(x=>x.synced||x.completed).length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return { timeout: true, total: all.length, pending: all.filter(x=>!x.synced&&!x.completed).length };
})()""", ap=True, t=90)
print(f"  {sync_force}")
report("BUG #2 fix: syncNow(force=true) reanuda", sync_force.get('completed', 0) >= 10, str(sync_force))

# Backend final
backend = ev("""(async () => {
  const r = await fetch('/api/products?limit=200', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') } });
  const d = await r.json();
  const products = Array.isArray(d) ? d : (d.products || []);
  return {
    total: products.length,
    offline80: products.filter(p => (p.name||'').startsWith('OFFLINE80-')).length
  };
})()""", ap=True)
print(f"\n[6] Backend final: {backend}")
report("LOCAL == NUBE: 10/10 productos en Supabase", backend.get('offline80', 0) >= 10, str(backend))

# Summary
print("\n" + "="*70)
print(f"RESULTADOS APK v1.0.176")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

with open(os.path.expanduser("~/android-v176-results.json"), "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: ~/android-v176-results.json")

shot = s('Page.captureScreenshot', {'format':'png'})
with open('C:/Users/DELL/AppData/Local/Temp/volvix-emulator/emu-v176-final.png','wb') as f:
    f.write(base64.b64decode(shot.get('data','')))
ws.close()
