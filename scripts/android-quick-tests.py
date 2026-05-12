"""Quick targeted tests - direct y rapido, sin esperas largas."""
import urllib.request, json, time, os, sys
from websocket import create_connection

tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab = next((t for t in tabs if t.get('type') == 'page'), None)
if not tab:
    print("NO TAB"); sys.exit(1)

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

print("\n=== Estado base ===", flush=True)
state = ev("""(async () => {
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) try { await window.OfflineQueue.init(); break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return { url: location.href, queue: (await window.OfflineQueue.getAll()).length, online: navigator.onLine, hasToken: !!localStorage.getItem('volvix_token') };
})()""", ap=True, t=30)
print(f"State: {state}", flush=True)

# Limpiar
ev("(async()=>{ try { await window.OfflineQueue.clear(); } catch(e) {} })()", ap=True, t=20)

# Plugins enum
print("\n=== Plugins nativos ===", flush=True)
plugins = ev("""({
  list: Object.keys(window.Capacitor?.Plugins || {})
})""")
print(f"  Plugins disponibles ({len(plugins.get('list',[]))}): {plugins.get('list')}", flush=True)
report("Plugins enumerated", len(plugins.get('list', [])) > 0, str(plugins.get('list')))

if plugins.get('list'):
    # Device
    device = ev("""(async () => {
      try { return await window.Capacitor.Plugins.Device.getInfo(); } catch(e) { return {error: e.message}; }
    })()""", ap=True, t=15)
    print(f"  Device: model={device.get('model')}, os={device.get('operatingSystem')}, version={device.get('osVersion')}, manuf={device.get('manufacturer')}, isVirtual={device.get('isVirtual')}", flush=True)
    report("Device plugin info Android", device.get('platform') == 'android', f"model={device.get('model')}")

    # Network
    net = ev("""(async () => {
      try { return await window.Capacitor.Plugins.Network.getStatus(); } catch(e) { return {error: e.message}; }
    })()""", ap=True, t=15)
    print(f"  Network: {net}", flush=True)
    report("Network plugin status", 'connected' in net, str(net))

    # Preferences set/get/remove
    pref = ev("""(async () => {
      try {
        const k = 'vlx_'+Date.now();
        await window.Capacitor.Plugins.Preferences.set({key:k, value:'XYZ'});
        const r1 = await window.Capacitor.Plugins.Preferences.get({key:k});
        await window.Capacitor.Plugins.Preferences.remove({key:k});
        const r2 = await window.Capacitor.Plugins.Preferences.get({key:k});
        return { set_get_value: r1.value, after_remove_value: r2.value };
      } catch(e) { return { error: e.message }; }
    })()""", ap=True, t=15)
    print(f"  Preferences: {pref}", flush=True)
    report("Preferences set/get/remove",
        pref.get('set_get_value') == 'XYZ' and pref.get('after_remove_value') is None,
        str(pref))

# Corrupción IDB simple
print("\n=== Corrupción IDB ===", flush=True)
corrupt = ev("""(async () => {
  await window.OfflineQueue.clear();
  for (let i=0; i<3; i++) {
    await window.OfflineQueue.enqueue({
      method:'POST', url:'/api/products',
      body:{name:'CRPT-'+Date.now()+'-'+i, code:'C'+i, price:1, tenant_id:'TNT001'},
      idempotencyKey: 'crpt-'+Date.now()+'-'+i
    });
  }
  // Corromper retries a NaN
  const db = await new Promise(r => { const x = indexedDB.open('volvix_offline_queue'); x.onsuccess = e => r(e.target.result); });
  const tx = db.transaction(['requests'], 'readwrite');
  const all = await new Promise(r => { const x = tx.objectStore('requests').getAll(); x.onsuccess = e => r(e.target.result); });
  for (const item of all) {
    item.retries = NaN;
    item.nextAttempt = -999999;
    await new Promise(r => { tx.objectStore('requests').put(item).onsuccess = () => r(); });
  }
  db.close();
  // App sigue viva?
  return { app_alive: typeof window.OfflineQueue?.enqueue === 'function', items_after_corrupt: (await window.OfflineQueue.getAll()).length };
})()""", ap=True, t=30)
print(f"  {corrupt}", flush=True)
report("App sobrevive IDB con NaN/valores tóxicos",
    isinstance(corrupt, dict) and corrupt.get('app_alive') is True,
    str(corrupt))

# Borrar DB entera y verificar recovery
print("\n=== Borrar IndexedDB completamente ===", flush=True)
del_db = ev("""(async () => {
  // Cerrar conexiones primero
  try { await window.OfflineQueue.clear(); } catch(e) {}
  // Delete database
  await new Promise(r => {
    const req = indexedDB.deleteDatabase('volvix_offline_queue');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
  // Re-init
  try { await window.OfflineQueue.init(); } catch(e) { return { initErr: e.message }; }
  // Probar enqueue + getAll
  await window.OfflineQueue.enqueue({
    method:'POST', url:'/api/products',
    body:{name:'AFTER-DELETE-'+Date.now(), code:'AD', price:1, tenant_id:'TNT001'},
    idempotencyKey: 'ad-'+Date.now()
  });
  return { after_delete_size: (await window.OfflineQueue.getAll()).length, app_alive: true };
})()""", ap=True, t=30)
print(f"  {del_db}", flush=True)
report("Recovery: nueva IDB tras delete completo",
    isinstance(del_db, dict) and del_db.get('after_delete_size', 0) >= 1,
    str(del_db))

# Summary
print("\n" + "="*70, flush=True)
print("RESUMEN", flush=True)
print("="*70, flush=True)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}", flush=True)
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}", flush=True)

with open(os.path.expanduser("~/android-quick-results.json"), "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

ws.close()
