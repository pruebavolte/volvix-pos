"""
TEST WEB SW v1.14.0 - Validar BUG #4 fix REAL post-deploy.
Hace doble visita para asegurar SW registrado, espera activacion, corta net y reload.
"""
import urllib.request, json, time, base64, os
from websocket import create_connection

CDP_PORT = 9236
PROD = "https://volvix-pos.vercel.app"
RESULTS = {"phase": "WEB-SW-V14", "tests": {}}

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:400]}

tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read())
tab = next((t for t in tabs if t.get('type') == 'page' and ('vercel' in t.get('url','') or PROD in t.get('url',''))), None)
if not tab:
    tab = next((t for t in tabs if t.get('type') == 'page'), None)
print(f"Tab: {tab.get('url','')[:80]}")
ws = create_connection(tab['webSocketDebuggerUrl'], timeout=30)
cid=[0]
def s(m,p=None):
    cid[0]+=1; o={'id':cid[0],'method':m}
    if p: o['params']=p
    ws.send(json.dumps(o))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==cid[0]: return r.get('result',{})
def ev(e, ap=False, t=20):
    r = s('Runtime.evaluate', {'expression':e, 'returnByValue':True, 'awaitPromise':ap, 'timeout':t*1000})
    if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:200]}
    return r.get('result',{}).get('value')
s('Page.enable'); s('Runtime.enable'); s('Network.enable')

print("\n[1] Asegurar SW registrado v1.14.0...")
# Forzar reload doble + esperar activación
s('Network.emulateNetworkConditions', {'offline':False, 'downloadThroughput':-1, 'uploadThroughput':-1, 'latency':0})
s('Page.reload', {'ignoreCache': True})
time.sleep(10)

sw_info = ev("""(async () => {
  if (!navigator.serviceWorker) return {no_sw: true};
  let waits = 0;
  while (!navigator.serviceWorker.controller && waits < 30) {
    await new Promise(r => setTimeout(r, 500));
    waits++;
  }
  let version = 'unknown';
  if (navigator.serviceWorker.controller) {
    const ch = new MessageChannel();
    const p = new Promise(r => { ch.port1.onmessage = e => r(e.data); setTimeout(()=>r({timeout:true}), 3000); });
    navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'}, [ch.port2]);
    const v = await p;
    version = v?.version || JSON.stringify(v);
  }
  const cacheNames = await caches.keys();
  return {
    controller: !!navigator.serviceWorker.controller,
    version,
    waited_loops: waits,
    cacheNames
  };
})()""", ap=True, t=25)
print(f"  {sw_info}")
report("SW v1.14.0 activo + controller",
    isinstance(sw_info, dict) and sw_info.get('controller') and 'v1.14' in str(sw_info.get('version','')),
    f"version={sw_info.get('version')}")

print("\n[2] Login + navegar a POS + esperar SW cache...")
ev("""(async () => {
  const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
  const d = await r.json();
  if (d.token) localStorage.setItem('volvix_token', d.token);
})()""", ap=True)
s('Page.navigate', {'url': f'{PROD}/salvadorex-pos.html'})
time.sleep(12)

# Esperar a que el cache se llene
time.sleep(5)
cache_state = ev("""(async () => {
  const names = await caches.keys();
  let totalCached = 0;
  let salvadorexCached = false;
  for (const n of names) {
    const c = await caches.open(n);
    const keys = await c.keys();
    totalCached += keys.length;
    if (keys.some(k => k.url.includes('salvadorex-pos.html'))) salvadorexCached = true;
  }
  return { totalCached, salvadorexCached, cacheNames: names };
})()""", ap=True)
print(f"  Cache state: {cache_state}")

print("\n[3] Crear 5 productos offline (post-SW activation)...")
created = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  await window.OfflineQueue.clear();
  const ts = Date.now();
  for (let i=0; i<5; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'WEB-V14-'+ts+'-'+i, code:'WV14'+ts+i, price:i+10, tenant_id:'TNT001'},
      idempotencyKey: 'wv14-'+ts+'-'+i
    });
  }
  return { count: (await window.OfflineQueue.getAll()).length };
})()""", ap=True, t=20)
print(f"  {created}")
report("5 productos creados online en queue", created.get('count', 0) >= 5, str(created))

# AHORA EL TEST CRUCIAL
print("\n[4] *** CORTAR INTERNET via CDP + RELOAD - test BUG #4 fix REAL ***")
s('Network.emulateNetworkConditions', {'offline':True, 'downloadThroughput':0, 'uploadThroughput':0, 'latency':0})
time.sleep(2)

s('Page.reload', {'ignoreCache': False})
time.sleep(12)

after_offline = ev("""({
  url: location.href,
  bodyLen: document.body?.innerHTML?.length || 0,
  title: document.title.slice(0,50),
  hasOQ: typeof window.OfflineQueue?.enqueue,
  is_chrome_error: location.href.includes('chrome-error'),
  is_fallback_html: document.body?.innerHTML?.includes('Reintentando'),
  has_login_inputs: !!document.querySelector('input[type="password"]'),
  has_pos_content: !!document.querySelector('[data-menu]')
})""")
print(f"  RESULT: {json.dumps(after_offline, indent=2, default=str)}")
report("BUG #4 fix: reload offline NO va a chrome-error",
    isinstance(after_offline, dict) and not after_offline.get('is_chrome_error') and after_offline.get('bodyLen', 0) > 1000,
    f"is_chrome_error={after_offline.get('is_chrome_error')}, bodyLen={after_offline.get('bodyLen')}")

# Verificar IDB sobrevive
idb_check = ev("""(async () => {
  if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); } catch(e) {}
  const all = await window.OfflineQueue?.getAll?.() || [];
  return { total: all.length, sample: all.slice(0,3).map(x => x.body?.name) };
})()""", ap=True)
print(f"  IDB tras reload offline: {idb_check}")
report("BUG #4 fix: IndexedDB sobrevive reload offline",
    isinstance(idb_check, dict) and idb_check.get('total', 0) >= 5,
    str(idb_check))

print("\n[5] Restaurar internet + sync los items...")
s('Network.emulateNetworkConditions', {'offline':False, 'downloadThroughput':-1, 'uploadThroughput':-1, 'latency':0})
time.sleep(3)

sync = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  for (let i=0; i<60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    if (all.filter(x => !x.synced && !x.completed).length === 0) {
      return { elapsed_s: i+1, completed: all.filter(x=>x.synced||x.completed).length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return { timeout: true, total: all.length };
})()""", ap=True, t=90)
print(f"  {sync}")
report("Sync WEB tras restaurar + reload offline", sync.get('completed', 0) >= 5 or sync.get('total', 999) == 0, str(sync))

# Backend
backend = ev("""(async () => {
  const r = await fetch('/api/products?limit=300', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') } });
  const d = await r.json();
  const products = Array.isArray(d) ? d : (d.products || []);
  return { v14_count: products.filter(p => (p.name||'').startsWith('WEB-V14-')).length };
})()""", ap=True)
print(f"\n[6] Backend: {backend}")
report("WEB V14 productos llegan a Supabase", backend.get('v14_count', 0) >= 5, str(backend))

print("\n" + "="*70)
print("RESULTADOS WEB SW v1.14.0")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

with open(os.path.expanduser("~/web-sw-v14-results.json"), "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

# Screenshot
shot = s('Page.captureScreenshot', {'format':'png'})
with open('C:/Users/DELL/AppData/Local/Temp/web-war/web-v14-final.png','wb') as f:
    f.write(base64.b64decode(shot.get('data','')))
ws.close()
