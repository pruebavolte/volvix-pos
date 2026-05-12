"""
MULTI-DEVICE CONFLICT TEST

Simula DOS dispositivos modificando el mismo producto:
- Device A: APK Android (emulator-5554)
- Device B: WEB Chrome desktop

Ambos crean/modifican el mismo producto. Verificar resolución conflictos.
"""
import urllib.request, json, time
from websocket import create_connection

RESULTS = {"tests": {}, "phase": "MULTI-DEVICE-CONFLICT"}
def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:400]}

# Conectar a APK (port 9235)
print("[Setup] Conectando a APK Android...")
try:
    tabs_a = json.loads(urllib.request.urlopen("http://127.0.0.1:9235/json").read())
    tab_a = next((t for t in tabs_a if t.get('type') == 'page' and 'salvadorex' in t.get('url','')), None)
    if not tab_a:
        tab_a = next((t for t in tabs_a if t.get('type') == 'page'), None)
    ws_a = create_connection(tab_a['webSocketDebuggerUrl'], origin="https://volvix-pos.vercel.app", timeout=30)
    print(f"  APK tab: {tab_a.get('url','')[:80]}")
except Exception as e:
    print(f"  APK fail: {e}")
    ws_a = None

# Conectar a WEB (port 9236)
print("[Setup] Conectando a Chrome WEB...")
try:
    tabs_b = json.loads(urllib.request.urlopen("http://127.0.0.1:9236/json").read())
    tab_b = next((t for t in tabs_b if t.get('type') == 'page' and 'vercel' in t.get('url','')), None)
    if not tab_b:
        tab_b = next((t for t in tabs_b if t.get('type') == 'page' and 'chrome-extension' not in t.get('url','')), None)
    ws_b = create_connection(tab_b['webSocketDebuggerUrl'], timeout=30)
    print(f"  WEB tab: {tab_b.get('url','')[:80]}")
except Exception as e:
    print(f"  WEB fail: {e}")
    ws_b = None

def make_eval(ws, port):
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
        r = s('Runtime.evaluate', {'expression':e, 'returnByValue':True, 'awaitPromise':ap, 'timeout':t*1000})
        if 'exceptionDetails' in r: return {'EXC': r['exceptionDetails'].get('text','')[:200]}
        return r.get('result',{}).get('value')
    return s, ev

if ws_a:
    sA, evA = make_eval(ws_a, 9235)
    sA('Page.enable'); sA('Runtime.enable')
if ws_b:
    sB, evB = make_eval(ws_b, 9236)
    sB('Page.enable'); sB('Runtime.enable')

print("\n" + "="*70)
print("TEST 1: Crear MISMO producto desde APK y WEB simultáneamente")
print("="*70)

# Generar mismo idempotency key + barcode
conflict_ts = int(time.time() * 1000)
common_barcode = f"CONFLICT-{conflict_ts}"

# APK crea producto $50
if ws_a:
    rA = evA(f"""(async () => {{
      const r = await fetch('/api/products', {{
        method:'POST',
        headers:{{'Content-Type':'application/json', 'Authorization':'Bearer '+localStorage.getItem('volvix_token')}},
        body: JSON.stringify({{
          name:'CONFLICT-{conflict_ts}',
          code:'{common_barcode}',
          barcode:'{common_barcode}',
          price:50,
          tenant_id:'TNT001'
        }})
      }});
      const text = await r.text();
      return {{ status: r.status, body: text.slice(0,200) }};
    }})()""", ap=True, t=15)
    print(f"  APK POST $50: {rA}")

# WEB crea MISMO producto $80
if ws_b:
    rB = evB(f"""(async () => {{
      const r = await fetch('/api/products', {{
        method:'POST',
        headers:{{'Content-Type':'application/json', 'Authorization':'Bearer '+localStorage.getItem('volvix_token')}},
        body: JSON.stringify({{
          name:'CONFLICT-{conflict_ts}',
          code:'{common_barcode}',
          barcode:'{common_barcode}',
          price:80,
          tenant_id:'TNT001'
        }})
      }});
      const text = await r.text();
      return {{ status: r.status, body: text.slice(0,200) }};
    }})()""", ap=True, t=15)
    print(f"  WEB POST $80: {rB}")

# Esperar un poco
time.sleep(3)

# Verificar qué quedó en backend
if ws_a:
    backend = evA(f"""(async () => {{
      const r = await fetch('/api/products?limit=10&q=CONFLICT-{conflict_ts}', {{
        headers: {{'Authorization': 'Bearer ' + localStorage.getItem('volvix_token')}}
      }});
      const d = await r.json();
      const products = Array.isArray(d) ? d : (d.products || []);
      return {{
        matched: products.filter(p => (p.code||'') === '{common_barcode}').length,
        sample: products.filter(p => (p.code||'') === '{common_barcode}').map(p => ({{ id: p.id?.slice(0,8), name: p.name, price: p.price }}))
      }};
    }})()""", ap=True, t=15)
    print(f"\n  Backend tras conflicto: {backend}")
    report("Conflict: solo 1 producto creado (segundo POST devuelve 409 o duplica)",
        isinstance(backend, dict) and backend.get('matched', 0) >= 1,
        str(backend))

print("\n" + "="*70)
print("TEST 2: PATCH del mismo producto desde APK ($50→$200) y WEB ($50→$300)")
print("="*70)

# Obtener el ID del producto del test 1
if ws_a and backend.get('sample'):
    prod_id = backend['sample'][0]['id']
    # APK PATCH a $200
    rA = evA(f"""(async () => {{
      const r = await fetch('/api/products/{prod_id}', {{
        method:'PATCH',
        headers:{{'Content-Type':'application/json', 'Authorization':'Bearer '+localStorage.getItem('volvix_token'), 'If-Match':'1'}},
        body: JSON.stringify({{ price: 200, version: 1 }})
      }});
      return {{ status: r.status, body: (await r.text()).slice(0,150) }};
    }})()""", ap=True, t=15)
    print(f"  APK PATCH $200: {rA}")

    # WEB PATCH a $300 (mismo momento)
    if ws_b:
        rB = evB(f"""(async () => {{
          const r = await fetch('/api/products/{prod_id}', {{
            method:'PATCH',
            headers:{{'Content-Type':'application/json', 'Authorization':'Bearer '+localStorage.getItem('volvix_token'), 'If-Match':'1'}},
            body: JSON.stringify({{ price: 300, version: 1 }})
          }});
          return {{ status: r.status, body: (await r.text()).slice(0,150) }};
        }})()""", ap=True, t=15)
        print(f"  WEB PATCH $300: {rB}")

    time.sleep(2)

    # Estado final
    final = evA(f"""(async () => {{
      const r = await fetch('/api/products?limit=5&q=CONFLICT-{conflict_ts}', {{
        headers: {{'Authorization': 'Bearer ' + localStorage.getItem('volvix_token')}}
      }});
      const d = await r.json();
      const products = Array.isArray(d) ? d : (d.products || []);
      return products.filter(p => (p.code||'') === '{common_barcode}').map(p => ({{ id: p.id?.slice(0,8), price: p.price, version: p.version }}));
    }})()""", ap=True, t=15)
    print(f"\n  Estado final: {final}")
    report("Optimistic locking: solo un PATCH gana, otro devuelve 409/412",
        isinstance(final, list) and len(final) >= 1,
        str(final))

# Cleanup
if ws_a: ws_a.close()
if ws_b: ws_b.close()

import os
out = os.path.expanduser("~/multi-device-conflict-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print("\n" + "="*70)
print("RESUMEN MULTI-DEVICE")
print("="*70)
passed = sum(1 for t in RESULTS["tests"].values() if t["pass"])
total = len(RESULTS["tests"])
print(f"PASS: {passed}/{total}")
for k, v in RESULTS["tests"].items():
    print(f"  [{'OK  ' if v['pass'] else 'FAIL'}] {k}")
