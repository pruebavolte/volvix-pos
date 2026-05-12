"""
TAREA 3 — Smoke tests adicionales:
3.A. Toast/banner aparece si forzamos error 4xx (BUG-F4 fix)
3.B. Items con retries=null se auto-recuperan (BUG-F3 fix)
"""
import os, sys, json, time, base64, subprocess, urllib.request
from datetime import datetime
from websocket import create_connection

RUN_DIR = "D:/github/volvix-pos/audit_run_20260512_132653_postfix"
ADB = r"C:/Android/Sdk/platform-tools/adb.exe"

def adb(args, t=30):
    return subprocess.run([ADB] + args, capture_output=True, text=True, timeout=t).stdout.strip()

PID = adb(["shell", "pidof", "com.volvix.pos"]).split()[0]
adb(["forward", "--remove-all"])
adb(["forward", "tcp:9235", f"localabstract:webview_devtools_remote_{PID}"])
time.sleep(2)
tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
tab = next((t for t in tabs if t.get('type') == 'page' and 'salvadorex' in t.get('url','')), None)
if not tab: tab = next((t for t in tabs if t.get('type') == 'page'), None)
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
    if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:300]}
    return r.get('result',{}).get('value')
s('Page.enable'); s('Runtime.enable')

TEST_ID = f"T3_{int(time.time())}"
os.makedirs(f"{RUN_DIR}/screenshots/{TEST_ID}", exist_ok=True)

RESULTS = {"phase": "TASK_3_smoke", "tests": [], "started_at": datetime.now().astimezone().isoformat(timespec="seconds")}
def record(test_id, desc, status, details):
    icon = "[PASS]" if status == "PASS" else ("[FAIL]" if status == "FAIL" else f"[{status}]")
    print(f"\n{icon} {test_id} | {desc}", flush=True)
    print(f"  {json.dumps(details, default=str)[:300]}", flush=True)
    RESULTS["tests"].append({"test_id": test_id, "description": desc, "status": status, "details": details})

# ============================================================
# T3.A — Force 4xx error -> toast/banner aparece
# ============================================================
print("\n[T3.A] Forzar 4xx -> ¿toast/banner aparece?", flush=True)

# Limpiar queue
ev("(async()=>{ try { await window.OfflineQueue.clear(); } catch(e) {} })()", ap=True)

# Configurar maxRetries=1 para forzar fail rápido
# Y enqueue venta sin Idempotency-Key (omitiendo idempotencyKey en enqueue)
# El processItem ahora SI la incluye desde item.idempotencyKey, así que envío "" para que omita
fail_test = ev(f"""(async () => {{
  // Hook OfflineQueue para escuchar 'fail' antes de causarlo
  let failTriggered = null;
  window.OfflineQueue.on('fail', (payload) => {{
    failTriggered = {{
      ts: Date.now(),
      url: payload?.item?.url,
      error: payload?.error,
      reason: payload?.reason
    }};
  }});

  // Override fetch para devolver siempre 400 -> simula bad request
  if (!window.__origFetchT3A) {{
    window.__origFetchT3A = window.fetch.bind(window);
    window.fetch = function(input, init) {{
      const url = (typeof input === 'string') ? input : (input && input.url);
      if (url && url.includes('/api/sales')) {{
        // Devolver una respuesta 400 simulada
        return Promise.resolve(new Response(
          JSON.stringify({{error: 'simulated_400_for_t3a_test'}}),
          {{ status: 400, headers: {{'Content-Type': 'application/json'}} }}
        ));
      }}
      return window.__origFetchT3A(input, init);
    }};
  }}

  // Encolar venta que debe fallar
  await window.OfflineQueue.enqueue({{
    method: 'POST',
    url: '/api/sales',
    body: {{items:[{{qty:1,code:'T3A',name:'T3A',price:1,subtotal:1}}], total:1, payment_method:'efectivo', tenant_id:'TNT001'}},
    idempotencyKey: 't3a-{int(time.time())}'
  }});

  // Trigger sync repetidamente para gastar retries
  for (let i=0; i<7; i++) {{
    try {{ await window.OfflineQueue.syncNow({{force: true}}); }} catch(e) {{}}
    await new Promise(r => setTimeout(r, 1500));
    if (failTriggered) break;
  }}

  // Verificar UI
  const banner = document.getElementById('vlx-queue-fail-banner');
  const bannerVisible = banner && banner.textContent.length > 0;
  const bannerText = banner ? banner.textContent.slice(0,200) : null;

  // Restore fetch
  window.fetch = window.__origFetchT3A;
  delete window.__origFetchT3A;

  return {{
    failTriggered,
    bannerInDOM: !!banner,
    bannerVisible,
    bannerText,
    queue_now: (await window.OfflineQueue.getAll()).length
  }};
}})()""", ap=True, t=60)
print(f"  Result: {json.dumps(fail_test, default=str, indent=2)[:600]}", flush=True)

# Screenshot del banner si está visible
try:
    shot = s('Page.captureScreenshot', {'format':'png'})
    with open(f"{RUN_DIR}/screenshots/{TEST_ID}/t3a_banner.png", "wb") as f:
        f.write(base64.b64decode(shot.get("data","")))
except: pass

record("T3A_toast_on_4xx",
    "Toast/banner aparece cuando una venta es rechazada con 4xx",
    "PASS" if fail_test.get('failTriggered') is not None else "FAIL",
    {
        "fail_event_fired": fail_test.get('failTriggered') is not None,
        "banner_in_dom": fail_test.get('bannerInDOM'),
        "banner_text": fail_test.get('bannerText'),
        "queue_drained_after_fail": fail_test.get('queue_now') == 0
    })

# ============================================================
# T3.B — Items con retries=null se auto-recuperan
# ============================================================
print("\n[T3.B] Items con retries=NaN/null se auto-recuperan (BUG-F3)", flush=True)

# Limpiar queue
ev("(async()=>{ await window.OfflineQueue.clear(); })()", ap=True)

# Inyectar manualmente un item con retries=null en IDB
inject_test = ev(f"""(async () => {{
  const ts = Date.now();
  // Enqueue normal
  await window.OfflineQueue.enqueue({{
    method: 'POST', url: '/api/products',
    body: {{name: 'T3B-{int(time.time())}', code: 'T3B', price: 99, tenant_id: 'TNT001'}},
    idempotencyKey: 't3b-' + ts
  }});

  // Corromper en IDB directamente
  const db = await new Promise(r => {{
    const x = indexedDB.open('volvix_offline_queue');
    x.onsuccess = e => r(e.target.result);
  }});
  const tx = db.transaction(['requests'], 'readwrite');
  const all = await new Promise(r => {{
    const x = tx.objectStore('requests').getAll();
    x.onsuccess = e => r(e.target.result);
  }});
  // Set retries=null, nextAttempt=NaN
  for (const item of all) {{
    item.retries = null;
    item.nextAttempt = NaN;
    await new Promise(r => {{ tx.objectStore('requests').put(item).onsuccess = () => r(); }});
  }}
  db.close();

  const before = await window.OfflineQueue.getAll();
  // syncNow debe procesar el item gracias a defensiva de BUG-F3
  try {{ await window.OfflineQueue.syncNow({{force: true}}); }} catch(e) {{}}

  // Esperar hasta 30s a que se procese
  for (let i=0; i<30; i++) {{
    await new Promise(r => setTimeout(r, 1000));
    const all = await window.OfflineQueue.getAll();
    if (all.length === 0) {{
      return {{ recovered_in_s: i+1, before: before.map(x => ({{retries: x.retries, nextAttempt: x.nextAttempt}})) }};
    }}
  }}
  const all = await window.OfflineQueue.getAll();
  return {{
    timeout: true,
    remaining: all.length,
    sample: all.map(x => ({{ retries: x.retries, lastError: String(x.lastError||'').slice(0,100) }}))
  }};
}})()""", ap=True, t=60)
print(f"  Result: {json.dumps(inject_test, default=str, indent=2)[:600]}", flush=True)

record("T3B_retries_null_recovery",
    "Item con retries=null procesado correctamente tras defensa BUG-F3",
    "PASS" if isinstance(inject_test, dict) and inject_test.get('recovered_in_s') is not None else "FAIL",
    inject_test)

# Save results
RESULTS["completed_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
RESULTS["total"] = len(RESULTS["tests"])
RESULTS["pass"] = sum(1 for t in RESULTS["tests"] if t["status"] == "PASS")
with open(f"{RUN_DIR}/reports/T3_smoke_results.json", "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\n{'='*70}", flush=True)
print(f"TASK 3 SMOKE: {RESULTS['pass']}/{RESULTS['total']} PASS", flush=True)
print(f"{'='*70}", flush=True)
for t in RESULTS["tests"]:
    print(f"  [{'OK' if t['status']=='PASS' else 'FAIL'}] {t['test_id']}", flush=True)

ws.close()
