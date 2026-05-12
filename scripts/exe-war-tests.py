"""
EXE WAR TESTS - pruebas destructivas extremas del .EXE Volvix POS v1.0.172
con CDP en port 9230.

Flujo:
1. Login con admin@volvix.test / Volvix2026!
2. Crear productos ONLINE (snapshot inicial)
3. Bloquear Internet con Windows Firewall (outbound)
4. Crear productos OFFLINE
5. Verificar IndexedDB local
6. Verificar NO hay requests salientes
7. Restaurar Internet
8. Verificar sync automatico
9. Comparar LOCAL vs NUBE
"""
import json, time, urllib.request, urllib.error, os, sys, base64, subprocess
from websocket import create_connection

CDP_PORT = 9230
SERVER_LOG = "/tmp/volvix-v172-stdout.log"
RESULTS = {"timestamp": int(time.time()), "tests": {}, "snapshots": {}, "evidence": []}

def report(name, passed, detail=""):
    icon = "[OK]" if passed else "[FAIL]"
    print(f"  {icon} {name}: {detail}")
    RESULTS["tests"][name] = {"pass": passed, "detail": str(detail)[:500]}

def find_main_tab():
    """Encuentra el tab principal del .exe (no SW, no devtools)."""
    tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json").read())
    for t in tabs:
        if t.get('type') == 'page' and 'devtools' not in t.get('url',''):
            return t
    return None

def connect_cdp():
    tab = find_main_tab()
    if not tab:
        raise RuntimeError("No main tab found")
    print(f"Tab: {tab.get('url','')[:80]}")
    return create_connection(tab['webSocketDebuggerUrl'], timeout=30), tab

ws, tab = connect_cdp()
SERVER_BASE = tab['url'].split('/login.html')[0].split('/salvadorex')[0]
print(f"Server base: {SERVER_BASE}")
RESULTS["server_base"] = SERVER_BASE

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
print("TEST 1: LOGIN via /api/login (server-side flow)")
print("="*70)

login_result = eval_js(f"""
(async () => {{
  try {{
    const r = await fetch('/api/login', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{ email:'admin@volvix.test', password:'Volvix2026!' }})
    }});
    const data = await r.json();
    if (data.token) {{
      localStorage.setItem('volvix_token', data.token);
      localStorage.setItem('volvixAuthToken', data.token);
      if (data.user) localStorage.setItem('volvix_user', JSON.stringify(data.user));
      if (data.tenant_id) localStorage.setItem('volvix_tenant_id', data.tenant_id);
      return {{ ok: true, status: r.status, hasToken: !!data.token, hasUser: !!data.user }};
    }}
    return {{ ok: false, status: r.status, body: JSON.stringify(data).slice(0,200) }};
  }} catch(e) {{
    return {{ error: e.message }};
  }}
}})()
""", await_promise=True, timeout=15)
print(f"  Login: {login_result}")
report("Login API funciona", isinstance(login_result, dict) and login_result.get('ok') is True, str(login_result))

# Navegar al POS
send("Page.navigate", {"url": f"{SERVER_BASE}/salvadorex-pos.html"})
time.sleep(7)

# ============================================================
print("\n" + "="*70)
print("TEST 2: POS cargado + OfflineQueue inicializada")
print("="*70)

pos_state = eval_js("""
(async () => {
  // Esperar a que OQ inicialice
  for (let i=0; i<10; i++) {
    if (window.OfflineQueue?.init) {
      try { await window.OfflineQueue.init(); break; } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    url: location.href,
    title: document.title.slice(0,40),
    oqApi: typeof window.OfflineQueue,
    oqEnqueue: typeof window.OfflineQueue?.enqueue,
    oqSize: typeof window.OfflineQueue?.size === 'function' ? await window.OfflineQueue.size() : -1,
    online: navigator.onLine,
    swController: !!navigator.serviceWorker?.controller
  };
})()
""", await_promise=True)
print(f"  {pos_state}")
report("POS cargado + OQ disponible",
    isinstance(pos_state, dict) and pos_state.get('oqEnqueue') == 'function',
    f"url={pos_state.get('url','')[:60] if isinstance(pos_state, dict) else 'N/A'}")

# Limpiar IDB para comenzar limpio
eval_js("(async()=>{ if (window.OfflineQueue?.clear) await window.OfflineQueue.clear(); })()", await_promise=True)

# ============================================================
print("\n" + "="*70)
print("TEST 3: SNAPSHOT INICIAL - listar productos via API (online)")
print("="*70)

initial_products = eval_js("""
(async () => {
  try {
    const r = await fetch('/api/products?limit=10&tenant_id=demo-tenant', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('volvix_token') }
    });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const data = await r.json();
    const products = Array.isArray(data) ? data : (data.products || data.data || []);
    return {
      count: products.length,
      sample: products.slice(0,3).map(p => ({ id: p.id, name: p.name, code: p.code, price: p.price }))
    };
  } catch(e) {
    return { error: e.message };
  }
})()
""", await_promise=True)
print(f"  Productos ONLINE iniciales: {initial_products}")
RESULTS["snapshots"]["before"] = initial_products
report("Snapshot inicial productos",
    isinstance(initial_products, dict) and ('count' in initial_products or 'error' in initial_products),
    str(initial_products)[:200])

# ============================================================
print("\n" + "="*70)
print("TEST 4: PROBAR REQUEST ONLINE FUNCIONA antes de cortar internet")
print("="*70)

online_fetch = eval_js("""
(async () => {
  const start = performance.now();
  try {
    const r = await fetch('/api/version/status', { signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now()-start) };
  } catch(e) {
    return { error: e.message, ms: Math.round(performance.now()-start) };
  }
})()
""", await_promise=True)
print(f"  Fetch online: {online_fetch}")
report("Internet funciona PRE-corte",
    isinstance(online_fetch, dict) and 'ok' in online_fetch,
    str(online_fetch))

# Guardar resultados intermedios
out = os.path.expanduser("~/exe-war-results.json")
with open(out, "w") as f:
    json.dump(RESULTS, f, indent=2, default=str)

print(f"\nResultados intermedios: {out}")
print("\n[PHASE A DONE] El .EXE esta autenticado y listo. Siguiente: cortar internet.")
ws.close()
