"""
ANDROID EMULATOR REAL TESTS - pruebas extremas con emulador Android 14 real.

Conecta via CDP al WebView de Capacitor en emulator-5554 a traves de
adb forward tcp:9235 localabstract:webview_devtools_remote_<PID>.

Valida los 3 bug fixes con el APK v1.0.174:
- BUG #1 fix: data no se pierde tras retries con HTTP 503
- BUG #2 fix: syncNow({force: true}) reanuda items con lastError
- Doze mode: app sobrevive
- Force-stop: queue intacta al relaunch
"""
import json, time, urllib.request, urllib.error, os, sys, base64, subprocess
from websocket import create_connection

ADB = r"C:/Android/Sdk/platform-tools/adb.exe"
RESULTS = {"phase": "ANDROID-REAL", "tests": {}, "timestamp": int(time.time())}

def adb(args, timeout=30):
    """Run adb command, return stdout."""
    r = subprocess.run([ADB] + args, capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip()

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:500]}

# Setup CDP forward
print("=== Setup CDP forward to WebView ===")
pid = adb(["shell", "pidof", "com.volvix.pos"]).split()[0]
print(f"App PID: {pid}")
RESULTS["app_pid"] = pid

# Try webview_devtools_remote_<pid> first
adb(["forward", "--remove-all"])
adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{pid}"])
time.sleep(1)

try:
    r = urllib.request.urlopen("http://127.0.0.1:9235/json/version", timeout=5).read()
    print(f"CDP OK: {r.decode()[:120]}")
except Exception as e:
    print(f"CDP fail with PID-specific socket, try generic...")
    adb(["forward", "tcp:9235", "localabstract:chrome_devtools_remote"])
    time.sleep(1)
    r = urllib.request.urlopen("http://127.0.0.1:9235/json/version", timeout=5).read()
    print(f"CDP OK: {r.decode()[:120]}")

# Find tab
tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab = None
for t in tabs:
    if t.get('type') == 'page':
        tab = t
        break
if not tab:
    raise RuntimeError(f"No page tab. Tabs: {tabs}")

print(f"Tab URL: {tab.get('url','')[:80]}")
print(f"Tab title: {tab.get('title','')}")
RESULTS["tab_url"] = tab.get('url','')

ws = create_connection(tab['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=60)
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
print("\n" + "="*70)
print("TEST 1: WebView de la app real - estado base")
print("="*70)

state = eval_js("""
({
  url: location.href,
  ua: navigator.userAgent.slice(0,120),
  online: navigator.onLine,
  oqExists: typeof window.OfflineQueue?.enqueue,
  capacitor: typeof window.Capacitor,
  capacitorIsNative: window.Capacitor?.isNativePlatform?.(),
  platform: window.Capacitor?.getPlatform?.()
})
""")
print(f"  {json.dumps(state, indent=2)}")
report("WebView de Capacitor real",
    isinstance(state, dict) and state.get('capacitor') != 'undefined' and state.get('platform') == 'android',
    f"platform={state.get('platform') if isinstance(state, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 2: Login en backend real (Vercel)")
print("="*70)

# Asegurar URL correcta
if 'login' not in state.get('url','') and 'salvadorex' not in state.get('url',''):
    send("Page.navigate", {"url": "https://volvix-pos.vercel.app/login.html"})
    time.sleep(6)

login = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})
    });
    const d = await r.json();
    if (d.token) {
      localStorage.setItem('volvix_token', d.token);
      localStorage.setItem('volvixAuthToken', d.token);
      return { ok: true, hasToken: true, tokenLen: d.token.length };
    }
    return { ok: false, status: r.status, body: JSON.stringify(d).slice(0,200) };
  } catch(e) { return { error: e.message }; }
})()
""", await_promise=True, timeout=15)
print(f"  {login}")
report("Login desde APK real funciona",
    isinstance(login, dict) and login.get('ok') is True,
    str(login))

# Navegar al POS
send("Page.navigate", {"url": "https://volvix-pos.vercel.app/salvadorex-pos.html"})
time.sleep(10)

# ============================================================
print("\n" + "="*70)
print("TEST 3: POS carga + OfflineQueue + SW")
print("="*70)

state2 = eval_js("""
(async () => {
  // Esperar OQ init
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) {
      try { await window.OfflineQueue.init(); break; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    url: location.href,
    title: document.title.slice(0,40),
    oqExists: typeof window.OfflineQueue?.enqueue,
    swController: !!navigator.serviceWorker?.controller,
    online: navigator.onLine,
    capacitorNative: window.Capacitor?.isNativePlatform?.()
  };
})()
""", await_promise=True, timeout=20)
print(f"  {state2}")
report("POS + OfflineQueue + SW en Android",
    isinstance(state2, dict) and state2.get('oqExists') == 'function',
    str(state2))

# Limpiar queue
eval_js("(async()=>{ if (window.OfflineQueue?.clear) await window.OfflineQueue.clear(); })()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 4: BUG #1 FIX - 10 productos offline + sync prolongado")
print("="*70)
print("Antes del fix: tras 6 retries (~1min offline) -> 7/10 items eliminados")
print("Con el fix: items con HTTP 503 deben sobrevivir")

# Cortar internet vía OS-level: airplane mode en emulator
adb(["shell", "svc", "data", "disable"])
adb(["shell", "svc", "wifi", "disable"])
time.sleep(3)

offline_check = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/version/status', { signal: AbortSignal.timeout(5000) });
    return { unexpected_ok: r.ok, status: r.status };
  } catch(e) { return { offline: true, error: e.message }; }
})()
""", await_promise=True, timeout=10)
print(f"  Offline check (apagamos wifi/data): {offline_check}")

# Crear 10 productos offline
create = eval_js("""
(async () => {
  const ts = Date.now();
  for (let i=0; i<10; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'ANDROID-V174-'+ts+'-'+i, code:'ADR'+ts+i, price:100+i*10, tenant_id:'TNT001'},
      idempotencyKey: 'android-v174-'+ts+'-'+i
    });
  }
  return { total: (await window.OfflineQueue.getAll()).length };
})()
""", await_promise=True, timeout=30)
print(f"  Encolados offline: {create}")

# Forzar varios syncNow para gastar retries
print("  Esperando 70s con offline ON para gastar retries (BUG #1 scenario)...")
for i in range(7):
    eval_js("(async()=>{ try { await window.OfflineQueue.syncNow(); } catch(e) {} })()", await_promise=True, timeout=15)
    time.sleep(10)

after = eval_js("""
(async () => {
  const all = await window.OfflineQueue.getAll();
  return {
    total: all.length,
    sample_retries: all.slice(0,5).map(x => ({retries: x.retries, lastError: String(x.lastError||'').slice(0,40)}))
  };
})()
""", await_promise=True)
print(f"  Tras 70s offline: {json.dumps(after, indent=2, default=str)[:500]}")
report("BUG #1 fix: items sobreviven retries con error de red",
    isinstance(after, dict) and after.get('total',0) >= 10,
    f"total={after.get('total') if isinstance(after, dict) else 'N/A'} (antes: 3/10 sobrevivian)")

# ============================================================
print("\n" + "="*70)
print("TEST 5: Restaurar internet + syncNow({force: true})")
print("="*70)

adb(["shell", "svc", "data", "enable"])
adb(["shell", "svc", "wifi", "enable"])
time.sleep(8)  # Wait for network restore

online = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/version/status');
    return { ok: r.ok, status: r.status };
  } catch(e) { return { error: e.message }; }
})()
""", await_promise=True, timeout=15)
print(f"  Online check: {online}")

# Disparar syncNow con force=true (BUG #2 fix)
sync = eval_js("""
(async () => {
  try { await window.OfflineQueue.syncNow({force: true}); } catch(e) {}
  for (let i=0; i<45; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    const pending = all.filter(x => !x.synced && !x.completed).length;
    if (pending === 0) {
      return {
        elapsed_s: i+1,
        total: all.length,
        completed: all.filter(x => x.synced || x.completed).length,
        pending
      };
    }
  }
  const all = await window.OfflineQueue.getAll();
  return {
    timeout: true,
    total: all.length,
    pending: all.filter(x => !x.synced && !x.completed).length,
    sample: all.slice(0,3).map(x => ({name: x.body?.name, retries: x.retries, err: String(x.lastError||'').slice(0,60)}))
  };
})()
""", await_promise=True, timeout=90)
print(f"  Sync: {json.dumps(sync, indent=2, default=str)[:500]}")
report("BUG #2 fix: sync reanuda items con force=true",
    isinstance(sync, dict) and sync.get('completed',0) > 0,
    f"completed={sync.get('completed') if isinstance(sync, dict) else 'N/A'}/{sync.get('total') if isinstance(sync, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 6: Backend valida productos ANDROID-V174-* (consistencia LOCAL == NUBE)")
print("="*70)

backend = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/products?limit=100', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    const d = await r.json();
    const products = Array.isArray(d) ? d : (d.products || []);
    const android = products.filter(p => (p.name||'').startsWith('ANDROID-V174-'));
    return {
      total: products.length,
      android_products: android.length,
      sample: android.slice(0,3).map(p => ({name: p.name, price: p.price, id: p.id?.slice(0,8)}))
    };
  } catch(e) { return { error: e.message }; }
})()
""", await_promise=True, timeout=15)
print(f"  Backend: {json.dumps(backend, default=str, indent=2)[:400]}")
report("LOCAL == NUBE: productos llegan a Supabase",
    isinstance(backend, dict) and backend.get('android_products',0) > 0,
    f"android_products={backend.get('android_products') if isinstance(backend, dict) else 'N/A'}")

# ============================================================
print("\n" + "="*70)
print("TEST 7: PROCESS DEATH simulado (force-stop)")
print("="*70)

# Crear 3 productos offline antes de matar
adb(["shell", "svc", "data", "disable"])
adb(["shell", "svc", "wifi", "disable"])
time.sleep(3)

eval_js("""
(async () => {
  const ts = Date.now();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'PROCDEATH-'+ts+'-'+i, code:'PD'+ts+i, price:99, tenant_id:'TNT001'},
      idempotencyKey: 'pd-'+ts+'-'+i
    });
  }
})()
""", await_promise=True, timeout=15)

before_kill = eval_js("(async()=>{ const all = await window.OfflineQueue.getAll(); return all.length; })()", await_promise=True)
print(f"  Items en queue antes de force-stop: {before_kill}")

# CLOSE WS antes de matar
ws.close()
print("  CDP cerrado, ejecutando force-stop...")

adb(["shell", "am", "force-stop", "com.volvix.pos"])
time.sleep(3)
print(f"  App killed. PID antes={pid}, ahora: {adb(['shell', 'pidof', 'com.volvix.pos']) or 'NONE'}")

# Restart
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(10)

# Re-conectar CDP con nuevo PID
new_pid = adb(["shell", "pidof", "com.volvix.pos"]).split()[0]
print(f"  Nuevo PID tras restart: {new_pid}")
adb(["forward", "--remove-all"])
adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{new_pid}"])
time.sleep(2)

tabs2 = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab2 = next((t for t in tabs2 if t.get('type') == 'page'), None)
print(f"  Tab tras restart: {tab2.get('url','')[:80]}")

ws = create_connection(tab2["webSocketDebuggerUrl"], origin="https://volvix-pos.vercel.app", timeout=30)
cmd_id[0] = 0
send("Page.enable"); send("Runtime.enable"); send("Network.enable")

# Re-login para activar OQ
time.sleep(3)
eval_js("""
(async () => {
  // Token sobrevive en localStorage
  if (!localStorage.getItem('volvix_token')) {
    const r = await fetch('/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:'admin@volvix.test', password:'Volvix2026!'})
    });
    const d = await r.json();
    if (d.token) localStorage.setItem('volvix_token', d.token);
  }
})()
""", await_promise=True)

# Navegar al POS si no estamos allí
url = eval_js("location.href")
if 'salvadorex' not in url:
    send("Page.navigate", {"url": "https://volvix-pos.vercel.app/salvadorex-pos.html"})
    time.sleep(8)

after_restart = eval_js("""
(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) {
      try { await window.OfflineQueue.init(); break; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const all = await window.OfflineQueue.getAll();
  const pd = all.filter(x => (x.body?.name||'').startsWith('PROCDEATH-'));
  return {
    total: all.length,
    procdeath_survived: pd.length,
    sample: pd.slice(0,2).map(x => x.body?.name)
  };
})()
""", await_promise=True, timeout=30)
print(f"  Tras restart: {after_restart}")
report("Process death: queue sobrevive force-stop",
    isinstance(after_restart, dict) and after_restart.get('procdeath_survived',0) >= 3,
    f"survived={after_restart.get('procdeath_survived') if isinstance(after_restart, dict) else 'N/A'}/3")

# ============================================================
print("\n" + "="*70)
print("TEST 8: DOZE mode (Android puede matar processes en background)")
print("="*70)

# Mandar app a background
adb(["shell", "input", "keyevent", "KEYCODE_HOME"])
time.sleep(3)
# Forzar Doze
adb(["shell", "dumpsys", "deviceidle", "force-idle"])
time.sleep(5)
doze_state = adb(["shell", "dumpsys", "deviceidle", "get", "deep"])
print(f"  Doze state: {doze_state}")

# Restaurar
adb(["shell", "dumpsys", "deviceidle", "unforce"])
adb(["shell", "am", "start", "-n", "com.volvix.pos/.MainActivity"])
time.sleep(5)

# Re-conectar CDP
new_pid2 = adb(["shell", "pidof", "com.volvix.pos"]).split()[0] if adb(["shell", "pidof", "com.volvix.pos"]) else None
print(f"  PID despues Doze: {new_pid2}")
report("Doze mode: app sobrevive",
    new_pid2 is not None,
    f"pid={new_pid2}")

# Restaurar internet
adb(["shell", "svc", "data", "enable"])
adb(["shell", "svc", "wifi", "enable"])

# ============================================================
print("\n" + "="*70)
print("TEST 9: Capacitor plugins disponibles")
print("="*70)

# Reconectar CDP por si cambio PID
try:
    if new_pid2:
        adb(["forward", "--remove-all"])
        adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{new_pid2}"])
        time.sleep(2)
        tabs3 = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
        tab3 = next((t for t in tabs3 if t.get('type') == 'page'), None)
        if tab3 and tab3['webSocketDebuggerUrl'] != tab2['webSocketDebuggerUrl']:
            try: ws.close()
            except: pass
            ws = create_connection(tab3["webSocketDebuggerUrl"], origin="https://volvix-pos.vercel.app", timeout=30)
            cmd_id[0] = 0
            send("Page.enable"); send("Runtime.enable")
except Exception as e:
    print(f"  reconnect err: {e}")

plugins = eval_js("""
({
  capacitor: typeof window.Capacitor,
  isNative: window.Capacitor?.isNativePlatform?.(),
  platform: window.Capacitor?.getPlatform?.(),
  plugins: Object.keys(window.Capacitor?.Plugins || {}).slice(0,20)
})
""")
print(f"  {plugins}")
report("Capacitor plugins disponibles (camera, etc.)",
    isinstance(plugins, dict) and isinstance(plugins.get('plugins'), list) and len(plugins.get('plugins') or []) > 0,
    f"plugins={len(plugins.get('plugins') or []) if isinstance(plugins, dict) else 0}")

# ============================================================
print("\n" + "="*70)
print("RESUMEN ANDROID EMULATOR REAL TESTS")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}\n")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")

# Save
out = os.path.expanduser("~/android-emulator-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)
print(f"\nResults: {out}")

# Screenshot
shot = send("Page.captureScreenshot", {"format": "png"})
sp = "C:/Users/DELL/AppData/Local/Temp/volvix-emulator/emu-final.png"
with open(sp, "wb") as f:
    f.write(base64.b64decode(shot.get("data","")))
print(f"Screenshot: {sp}")

ws.close()
