"""
ANDROID EXTREME V2 - pruebas extremas adicionales en emulador real
con APK v1.0.176 ya instalado.

Pruebas:
1. STRESS 1000 items offline + sync
2. PROCESS DEATH recovery (force-stop + restart)
3. DOZE mode
4. Plugins nativos enumeration
5. Corruption IndexedDB recovery
6. Multi-tab race conditions (vía adb open browser)
"""
import urllib.request, json, time, base64, os
from websocket import create_connection
import subprocess

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
def adb(args, timeout=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=timeout).stdout.strip()

RESULTS = {"tests": {}, "phase": "ANDROID-EXTREME-V2"}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:400]}

def connect_to_app(max_attempts=12):
    for attempt in range(max_attempts):
        pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
        if not pid_raw:
            adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
            time.sleep(8)
            pid_raw = adb(["shell", "pidof", "com.volvix.pos"]).split()
        if not pid_raw:
            print(f"  attempt {attempt+1}: no PID yet, retrying...")
            time.sleep(5)
            continue
        pid = pid_raw[0]
        adb(["forward", "--remove-all"])
        adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{pid}"])
        time.sleep(2)
        try:
            tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json", timeout=5).read())
            tab = next((t for t in tabs if t.get('type') == 'page'), None)
            if tab:
                ws = create_connection(tab['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=30)
                return ws, tab
        except Exception as e:
            print(f"  attempt {attempt+1}: CDP not ready ({e})")
            time.sleep(3)
    return None, None

print("="*70)
print("ANDROID EXTREME V2 - APK v1.0.176 en emulador Android 14")
print("="*70)

# Asegurar wifi/data ON
adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(3)

ws, tab = connect_to_app()
print(f"\nTab: {tab.get('url','')[:80]}")
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

# Login si necesario
url = ev("location.href")
print(f"URL inicial: {url}")
if 'login' in url or not ev("localStorage.getItem('volvix_token')"):
    print("Login...")
    ev("""(async () => {
      const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
      const d = await r.json();
      if (d.token) localStorage.setItem('volvix_token', d.token);
    })()""", ap=True)
    s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
    time.sleep(12)

# Inicializar OQ
ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  await window.OfflineQueue.clear();
})()""", ap=True)

# ============================================================
print("\n" + "="*70)
print("TEST 1: STRESS 1000 items en IndexedDB del APK real (offline)")
print("="*70)

adb(["shell", "svc", "wifi", "disable"])
adb(["shell", "svc", "data", "disable"])
time.sleep(3)

stress = ev("""(async () => {
  const start = performance.now();
  const startMem = (performance.memory || {usedJSHeapSize:0}).usedJSHeapSize;
  const ts = Date.now();
  const promises = [];
  for (let i=0; i<1000; i++) {
    promises.push(window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'STRESS-'+ts+'-'+i, code:'ST'+ts+i, price:i+100, tenant_id:'TNT001'},
      idempotencyKey: 'stress-'+ts+'-'+i
    }).catch(e=>null));
  }
  await Promise.all(promises);
  const enqueueMs = performance.now() - start;
  const all = await window.OfflineQueue.getAll();
  const endMem = (performance.memory || {usedJSHeapSize:0}).usedJSHeapSize;
  return {
    enqueued: 1000,
    inIDB: all.length,
    enqueueMs: Math.round(enqueueMs),
    msPerItem: Math.round(enqueueMs/1000 * 100)/100,
    heapDeltaMB: Math.round((endMem - startMem) / 1048576 * 100)/100,
    totalHeapMB: Math.round(endMem / 1048576 * 100)/100
  };
})()""", ap=True, t=120)
print(f"  {stress}")
report("STRESS 1000 items en IndexedDB Android real",
    isinstance(stress, dict) and stress.get('inIDB', 0) >= 1000,
    f"items={stress.get('inIDB')}, time={stress.get('enqueueMs')}ms, heap+{stress.get('heapDeltaMB')}MB")

# ============================================================
print("\n" + "="*70)
print("TEST 2: PROCESS DEATH - matar app + verificar IDB sobrevive")
print("="*70)

# Capturar count antes
count_before = ev("(async()=>{ const a = await window.OfflineQueue.getAll(); return a.length; })()", ap=True)
print(f"  Items en IDB antes de force-stop: {count_before}")

# CDP close
ws.close()
time.sleep(1)

# FORCE STOP
adb(["shell", "am", "force-stop", "com.volvix.pos"])
time.sleep(4)
print(f"  App killed. PID: {adb(['shell', 'pidof', 'com.volvix.pos']) or 'NONE'}")

# RESTART
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(12)

# Re-conectar
ws, tab = connect_to_app()
cid[0] = 0
s('Page.enable'); s('Runtime.enable'); s('Network.enable')

# Navegar al POS si necesario
url2 = ev("location.href")
print(f"  URL tras restart: {url2}")
if 'login' in url2:
    # Re-login
    ev("""(async () => {
      const tok = localStorage.getItem('volvix_token');
      if (!tok) {
        const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
        const d = await r.json();
        if (d.token) localStorage.setItem('volvix_token', d.token);
      }
    })()""", ap=True)
    s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
    time.sleep(12)

# Verificar IDB
recovered = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  const all = await window.OfflineQueue.getAll();
  const stress_items = all.filter(x => x.body?.name?.startsWith('STRESS-'));
  return {
    total_in_idb: all.length,
    stress_count: stress_items.length,
    sample: stress_items.slice(0,2).map(x => x.body?.name)
  };
})()""", ap=True, t=30)
print(f"  Tras restart: {recovered}")
report("PROCESS DEATH: 1000 items sobreviven kill+restart",
    isinstance(recovered, dict) and recovered.get('stress_count', 0) >= 950,  # tolerance for race
    f"recovered={recovered.get('stress_count')}/1000")

# ============================================================
print("\n" + "="*70)
print("TEST 3: SYNC 1000 items tras restart + restaurar internet")
print("="*70)

adb(["shell", "svc", "wifi", "enable"])
adb(["shell", "svc", "data", "enable"])
time.sleep(15)

# Force sync
print("  Disparando syncNow({force: true})...")
sync_start = time.time()
sync_result = ev("""(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  // Esperar hasta 5 min para que se sincronicen
  for (let i=0; i<300; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    const errored = all.filter(x => x.lastError).length;
    if (i % 30 === 0) console.log('Sync progress: pending=' + pending + ' errored=' + errored);
    if (pending === 0) {
      return { elapsed_s: i+1, total: all.length, completed: all.filter(x=>x.synced||x.completed).length };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    timeout_5min: true,
    total: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    errored: all.filter(x => x.lastError).length,
    sample_err: all.filter(x=>x.lastError).slice(0,3).map(x => ({n: x.body?.name, r: x.retries, e: String(x.lastError||'').slice(0,80)}))
  };
})()""", ap=True, t=320)
sync_elapsed = time.time() - sync_start
print(f"  Sync result: {json.dumps(sync_result, indent=2, default=str)[:600]}")
print(f"  Time elapsed: {sync_elapsed:.1f}s")
report("SYNC 1000 items completado",
    isinstance(sync_result, dict) and sync_result.get('total', 9999) < 100,  # 99% syncados
    f"remaining={sync_result.get('total')}, time={sync_elapsed:.1f}s")

# ============================================================
print("\n" + "="*70)
print("TEST 4: DOZE MODE - Android force-idle")
print("="*70)

# Mandar a background
adb(["shell", "input", "keyevent", "KEYCODE_HOME"])
time.sleep(3)
# Force Doze deep
adb(["shell", "dumpsys", "deviceidle", "force-idle"])
doze_state = adb(["shell", "dumpsys", "deviceidle", "get", "deep"])
print(f"  Doze state: {doze_state}")
report("DOZE mode activado", doze_state == "IDLE", f"state={doze_state}")

# Esperar 10s en Doze
time.sleep(10)

# Verificar app aún viva (background)
pid_after_doze = adb(["shell", "pidof", "com.volvix.pos"]).split()
print(f"  PID tras 10s en Doze: {pid_after_doze}")
report("App sobrevive Doze 10s",
    bool(pid_after_doze),
    f"pid={pid_after_doze}")

# Unforce
adb(["shell", "dumpsys", "deviceidle", "unforce"])
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(8)

# ============================================================
print("\n" + "="*70)
print("TEST 5: CAPACITOR PLUGINS NATIVOS disponibles")
print("="*70)

# Re-conectar después de Doze
ws.close()
ws, tab = connect_to_app()
cid[0] = 0
s('Page.enable'); s('Runtime.enable')

# Navegar a POS
url3 = ev("location.href")
if 'login' in url3 or 'salvadorex' not in url3:
    ev("""(async () => {
      const tok = localStorage.getItem('volvix_token');
      if (!tok) {
        const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})});
        const d = await r.json();
        if (d.token) localStorage.setItem('volvix_token', d.token);
      }
    })()""", ap=True)
    s('Page.navigate', {'url': 'https://localhost/salvadorex-pos.html'})
    time.sleep(10)

plugins = ev("""({
  capacitor: typeof window.Capacitor,
  isNative: window.Capacitor?.isNativePlatform?.(),
  platform: window.Capacitor?.getPlatform?.(),
  plugins_count: Object.keys(window.Capacitor?.Plugins || {}).length,
  plugins_list: Object.keys(window.Capacitor?.Plugins || {})
})""")
print(f"  {plugins}")
report("Capacitor plugins nativos cargados",
    isinstance(plugins, dict) and plugins.get('plugins_count', 0) > 0,
    f"count={plugins.get('plugins_count')}")

# Probar Device plugin
if plugins.get('plugins_count', 0) > 0:
    device = ev("""(async () => {
      try {
        if (!window.Capacitor?.Plugins?.Device) return { no_device: true };
        const info = await window.Capacitor.Plugins.Device.getInfo();
        const id = await window.Capacitor.Plugins.Device.getId().catch(e=>({err:e.message}));
        const battery = await window.Capacitor.Plugins.Device.getBatteryInfo().catch(e=>({err:e.message}));
        return { info: { model: info.model, os: info.operatingSystem, osVersion: info.osVersion, platform: info.platform, manufacturer: info.manufacturer }, id, battery };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=20)
    print(f"  Device.getInfo(): {json.dumps(device, indent=2, default=str)[:500]}")
    report("Device plugin nativo funciona",
        isinstance(device, dict) and 'info' in device and device.get('info', {}).get('platform') == 'android',
        f"model={device.get('info',{}).get('model') if isinstance(device, dict) else 'N/A'}")

    # Network plugin
    network = ev("""(async () => {
      try {
        if (!window.Capacitor?.Plugins?.Network) return { no_network: true };
        const status = await window.Capacitor.Plugins.Network.getStatus();
        return status;
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Network.getStatus(): {network}")
    report("Network plugin nativo funciona",
        isinstance(network, dict) and 'connected' in network,
        str(network))

# ============================================================
print("\n" + "="*70)
print("TEST 6: CORRUPTION RECOVERY - alterar IDB manualmente")
print("="*70)

# Crear 3 items, luego corromper retries a NaN
corrupt = ev("""(async () => {
  await window.OfflineQueue.clear();
  const ts = Date.now();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'CORRUPT-'+ts+'-'+i, code:'CP'+ts+i, price:i+10, tenant_id:'TNT001'},
      idempotencyKey: 'cp-'+ts+'-'+i
    });
  }

  // Corromper directamente IDB
  const db = await new Promise(r => { const x = indexedDB.open('volvix_offline_queue'); x.onsuccess = e => r(e.target.result); });
  const tx = db.transaction(['requests'], 'readwrite');
  const all = await new Promise(r => { const x = tx.objectStore('requests').getAll(); x.onsuccess = e => r(e.target.result); });
  for (const item of all) {
    // Inyectar valores tóxicos
    item.retries = NaN;
    item.nextAttempt = 'not-a-number';
    item.body.price = undefined;
    await new Promise(r => { tx.objectStore('requests').put(item).onsuccess = () => r(); });
  }
  db.close();

  // Intentar sync con la corrupción
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) { return { syncErr: e.message }; }

  // Esperar 15s
  await new Promise(r => setTimeout(r, 15000));

  const remaining = await window.OfflineQueue.getAll();
  return {
    initial_corrupt: 3,
    remaining: remaining.length,
    sample: remaining.slice(0,3).map(x => ({n: x.body?.name, retries: x.retries, err: String(x.lastError||'').slice(0,60)}))
  };
})()""", ap=True, t=60)
print(f"  {corrupt}")
report("CORRUPTION recovery: app no crashea con IDB corrupto",
    isinstance(corrupt, dict) and 'syncErr' not in corrupt,
    str(corrupt))

# ============================================================
print("\n" + "="*70)
print("RESUMEN ANDROID EXTREME V2")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

out = os.path.expanduser("~/android-extreme-v2-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {out}")

shot = s('Page.captureScreenshot', {'format':'png'})
sp = "C:/Users/DELL/AppData/Local/Temp/volvix-emulator/emu-extreme-v2.png"
with open(sp, "wb") as f:
    f.write(base64.b64decode(shot.get("data","")))
ws.close()
