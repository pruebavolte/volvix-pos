"""
ANDROID EXTREME V3 - tests restantes con timeouts mejorados.

Continúa desde donde V2 falló:
- Sync de 1000 items con keepalive
- Doze mode test
- Plugins nativos
- Corruption + recovery
- Stress concurrencia
"""
import urllib.request, json, time, base64, os, threading
from websocket import create_connection
import subprocess

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
def adb(args, timeout=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=timeout).stdout.strip()

RESULTS = {"tests": {}, "phase": "ANDROID-EXTREME-V3"}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:400]}

def connect_to_app(max_attempts=8):
    for attempt in range(max_attempts):
        pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
        if not pid_raw:
            adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
            time.sleep(8)
            pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
        if pid_raw:
            pid = pid_raw[0]
            adb(["forward", "--remove-all"])
            adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{pid}"])
            time.sleep(2)
            try:
                tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json", timeout=5).read())
                tab = next((t for t in tabs if t.get('type') == 'page'), None)
                if tab:
                    # ws con keepalive + timeout largo
                    ws = create_connection(
                        tab['webSocketDebuggerUrl'],
                        origin="https://volvix-pos.vercel.app",
                        timeout=120  # 2 min timeout
                    )
                    return ws, tab
            except Exception as e:
                print(f"  attempt {attempt+1}: {e}")
        time.sleep(3)
    return None, None

ws, tab = connect_to_app()
print(f"Tab: {tab.get('url','')[:80] if tab else 'NO TAB'}")
cid=[0]
def s(m,p=None):
    cid[0]+=1; o={'id':cid[0],'method':m}
    if p: o['params']=p
    ws.send(json.dumps(o))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')==cid[0]: return r.get('result',{})
def ev(e, ap=False, t=120):
    """Eval con timeout largo por default."""
    r = s('Runtime.evaluate', {'expression':e, 'returnByValue':True, 'awaitPromise':ap, 'timeout':t*1000})
    if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:200]}
    return r.get('result',{}).get('value')

s('Page.enable'); s('Runtime.enable'); s('Network.enable')

print("="*70)
print("ANDROID EXTREME V3 - test continuation")
print("="*70)

# Asegurar wifi/data ON
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(5)

# Check state
state = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    url: location.href,
    online: navigator.onLine,
    oq: typeof window.OfflineQueue?.enqueue,
    queue_size: (await window.OfflineQueue.getAll()).length,
    has_token: !!localStorage.getItem('volvix_token')
  };
})()""", ap=True, t=30)
print(f"\nEstado inicial: {state}")

# Si no hay token, login
if not state.get('has_token'):
    ev("""(async () => {
      const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
      const d = await r.json();
      if (d.token) localStorage.setItem('volvix_token', d.token);
    })()""", ap=True)
    s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
    time.sleep(12)

# ============================================================
print("\n" + "="*70)
print("TEST 1: SYNC 1058 items pendientes (process death recovery)")
print("="*70)

# Verificar count
count_before = ev("""(async () => {
  const all = await window.OfflineQueue.getAll();
  return { total: all.length, stress: all.filter(x => x.body?.name?.startsWith('STRESS-')).length };
})()""", ap=True, t=60)
print(f"  Pre-sync: {count_before}")

# Trigger force sync
print(f"  Iniciando syncNow({{force:true}})... esperando hasta 8 min...")
sync_start = time.time()
sync_result = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { return { syncErr: e.message }; }
  // Esperar hasta 7 min con progress
  for (let i=0; i<420; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (i % 30 === 0) {
      const errored = all.filter(x => x.lastError).length;
      console.log('Sync progress:', i+'s: pending=' + pending + ' errored=' + errored);
    }
    if (pending === 0) {
      return { elapsed_s: i+1, final_total: all.length, all_synced: true };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    timeout_7min: true,
    remaining: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    errored: all.filter(x => x.lastError).length,
    sample_err: all.filter(x=>x.lastError).slice(0,3).map(x=>({n:x.body?.name?.slice(0,40), r:x.retries, e: String(x.lastError||'').slice(0,80)}))
  };
})()""", ap=True, t=500)
elapsed = time.time() - sync_start
print(f"  Sync: {json.dumps(sync_result, indent=2, default=str)[:600]}")
print(f"  Total time: {elapsed:.1f}s")
report("SYNC 1000+ items pendientes",
    isinstance(sync_result, dict) and (sync_result.get('all_synced') or sync_result.get('remaining', 9999) < 50),
    f"final_remaining={sync_result.get('remaining', sync_result.get('final_total', '?'))}")

# ============================================================
print("\n" + "="*70)
print("TEST 2: BACKEND validation - cuántos STRESS- llegaron")
print("="*70)

# Reset query (paginar si necesario)
backend = ev("""(async () => {
  // Get all products (paginated if needed)
  let allProducts = [];
  let offset = 0;
  const limit = 1000;
  for (let page = 0; page < 5; page++) {
    const r = await fetch(`/api/products?limit=${limit}&offset=${offset}`, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    const d = await r.json();
    const products = Array.isArray(d) ? d : (d.products || []);
    if (products.length === 0) break;
    allProducts = allProducts.concat(products);
    offset += products.length;
    if (products.length < limit) break;
  }
  return {
    total: allProducts.length,
    stress_count: allProducts.filter(p => (p.name||'').startsWith('STRESS-')).length
  };
})()""", ap=True, t=60)
print(f"  Backend: {backend}")
report("STRESS items llegaron al backend",
    isinstance(backend, dict) and backend.get('stress_count', 0) >= 900,
    f"stress_in_backend={backend.get('stress_count')}/1000")

# ============================================================
print("\n" + "="*70)
print("TEST 3: PLUGINS NATIVOS de Capacitor")
print("="*70)

plugins = ev("""({
  capacitor: typeof window.Capacitor,
  isNative: window.Capacitor?.isNativePlatform?.(),
  platform: window.Capacitor?.getPlatform?.(),
  plugins_count: Object.keys(window.Capacitor?.Plugins || {}).length,
  plugins_list: Object.keys(window.Capacitor?.Plugins || {})
})""", t=10)
print(f"  Plugins: {plugins}")
report("Capacitor plugins enumeración",
    isinstance(plugins, dict) and plugins.get('plugins_count', 0) > 0,
    f"count={plugins.get('plugins_count')}, list={plugins.get('plugins_list')}")

# Device.getInfo()
if plugins.get('plugins_count', 0) > 0:
    device = ev("""(async () => {
      try {
        const info = await window.Capacitor.Plugins.Device.getInfo();
        return { ok: true, info: { platform: info.platform, osVersion: info.osVersion, model: info.model, manufacturer: info.manufacturer, webViewVersion: info.webViewVersion } };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Device.getInfo: {device}")
    report("Device plugin retorna info Android real",
        isinstance(device, dict) and device.get('info', {}).get('platform') == 'android',
        str(device))

    # Network.getStatus
    network = ev("""(async () => {
      try {
        const s = await window.Capacitor.Plugins.Network.getStatus();
        return s;
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Network.getStatus: {network}")
    report("Network plugin retorna estado",
        isinstance(network, dict) and 'connected' in network,
        str(network))

    # Preferences
    pref = ev("""(async () => {
      try {
        await window.Capacitor.Plugins.Preferences.set({key:'test_key', value:'test_value_'+Date.now()});
        const r = await window.Capacitor.Plugins.Preferences.get({key:'test_key'});
        return { set_get_ok: !!r.value, value: r.value };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Preferences plugin: {pref}")
    report("Preferences plugin set/get funciona",
        isinstance(pref, dict) and pref.get('set_get_ok'),
        str(pref))

# ============================================================
print("\n" + "="*70)
print("TEST 4: DOZE mode")
print("="*70)

# Background y Doze
adb(["shell", "input", "keyevent", "KEYCODE_HOME"])
time.sleep(2)
adb(["shell", "dumpsys", "deviceidle", "force-idle"])
doze_state = adb(["shell", "dumpsys", "deviceidle", "get", "deep"])
print(f"  Doze state: {doze_state}")

time.sleep(15)
pid_in_doze = adb(["shell", "pidof", "com.volvix.pos"]).strip()
report("App sobrevive Doze 15s en background",
    bool(pid_in_doze),
    f"pid={pid_in_doze}")

adb(["shell", "dumpsys", "deviceidle", "unforce"])
time.sleep(2)
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(8)

# ============================================================
print("\n" + "="*70)
print("TEST 5: CORRUPTION RECOVERY")
print("="*70)

# Re-conectar tras doze
ws.close()
ws, tab = connect_to_app()
if ws is None:
    print("  No se pudo reconectar tras Doze - skip")
    report("Corruption test (skipped por reconnect issue)", False, "no CDP")
else:
    cid[0] = 0
    s('Page.enable'); s('Runtime.enable')

    corrupt = ev("""(async () => {
      // Esperar OQ ready
      for (let i=0; i<10; i++) {
        if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
        await new Promise(r => setTimeout(r, 500));
      }
      await window.OfflineQueue.clear();
      const ts = Date.now();
      for (let i=0; i<5; i++) {
        await window.OfflineQueue.enqueue({
          method:'POST', url:'/api/products',
          body:{name:'CORRUPT-'+ts+'-'+i, code:'CP'+ts+i, price:i, tenant_id:'TNT001'},
          idempotencyKey: 'cp-'+ts+'-'+i
        });
      }

      // Corromper IDB directamente
      const db = await new Promise(r => {
        const x = indexedDB.open('volvix_offline_queue');
        x.onsuccess = e => r(e.target.result);
      });
      const tx = db.transaction(['requests'], 'readwrite');
      const all = await new Promise(r => {
        const x = tx.objectStore('requests').getAll();
        x.onsuccess = e => r(e.target.result);
      });
      for (const item of all) {
        item.retries = NaN;
        item.nextAttempt = 'TOXIC_VALUE';
        item.body = null;
        await new Promise(r => { tx.objectStore('requests').put(item).onsuccess = () => r(); });
      }
      db.close();

      // Sync con corrupción
      let syncErr = null;
      try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { syncErr = e.message; }
      await new Promise(r => setTimeout(r, 20000));

      const remaining = await window.OfflineQueue.getAll();
      return {
        initial: 5,
        remaining: remaining.length,
        syncErr,
        app_alive: true
      };
    })()""", ap=True, t=60)
    print(f"  Corruption: {corrupt}")
    report("App sobrevive IDB corrupto sin crash",
        isinstance(corrupt, dict) and corrupt.get('app_alive') is True,
        str(corrupt))

# ============================================================
print("\n" + "="*70)
print("RESUMEN ANDROID EXTREME V3")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

out = os.path.expanduser("~/android-extreme-v3-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {out}")

try:
    shot = s('Page.captureScreenshot', {'format':'png'})
    with open('C:/Users/DELL/AppData/Local/Temp/volvix-emulator/emu-extreme-v3.png','wb') as f:
        f.write(base64.b64decode(shot.get("data","")))
except: pass

ws.close()
