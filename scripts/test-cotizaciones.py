"""Test Cotizaciones via CDP."""
import socket, struct, base64, os, json, time, urllib.request

def ws_connect(page_id):
    sock = socket.create_connection(("127.0.0.1", 9224), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    sock.send((f"GET /devtools/page/{page_id} HTTP/1.1\r\nHost: 127.0.0.1:9224\r\n"
               f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    sock.recv(4096)
    return sock

def make_ws(sock):
    def sf(p):
        b=p.encode();h=bytearray([0x81]);ln=len(b);m=os.urandom(4)
        if ln<126:h.append(0x80|ln)
        elif ln<65536:h.append(0x80|126);h+=struct.pack(">H",ln)
        else:h.append(0x80|127);h+=struct.pack(">Q",ln)
        h+=m;sock.send(bytes(h)+bytes(b[i]^m[i%4] for i in range(ln)))
    def rf():
        h=b""
        while len(h)<2:h+=sock.recv(2-len(h))
        ln=h[1]&0x7F
        if ln==126:ln=struct.unpack(">H",sock.recv(2))[0]
        elif ln==127:ln=struct.unpack(">Q",sock.recv(8))[0]
        d=b""
        while len(d)<ln:
            c=sock.recv(min(ln-len(d),65536))
            if not c:break
            d+=c
        return d.decode(errors='ignore')
    mid=[0]
    def call(method,params=None):
        mid[0]+=1;cid=mid[0]
        sf(json.dumps({"id":cid,"method":method,"params":params or {}}))
        while True:
            try:o=json.loads(rf())
            except:continue
            if o.get("id")==cid:return o.get("result")
    def ej(c):
        r=call("Runtime.evaluate",{"expression":c,"returnByValue":True,"awaitPromise":True})
        return r and r.get("result",{}).get("value")
    return call, ej

pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9224/json").read())
page = next((p for p in pages if 'salvadorex-pos' in p.get('url','') or 'login' in p.get('url','')), None)
sock = ws_connect(page['id'])
call, ej = make_ws(sock)

url = ej("location.href")
print(f"Current: {url[:80]}")

if 'login' in (url or '').lower():
    print("Logging in...")
    loginR = ej("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@volvix.test',password:'Volvix2026!'})}).then(r=>r.json()).then(j=>JSON.stringify(j))")
    lj = json.loads(loginR)
    token = lj.get('token')
    user = lj.get('user',{})
    setup = ("localStorage.setItem('volvix_token','" + token + "');" +
             "localStorage.setItem('volvix_session',JSON.stringify({" +
             "user_id:'" + user.get('id','') + "'," +
             "email:'" + user.get('email','') + "'," +
             "role:'" + user.get('volvix_role','') + "'," +
             "tenant_id:'" + user.get('tenant_id','') + "'}));'ok'")
    ej(setup)
    ej("window.location.replace('/salvadorex-pos.html')")
    time.sleep(6)
    sock.close()
    pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9224/json").read())
    pos_p = next((p for p in pages if 'salvadorex-pos' in p.get('url','')), None)
    sock = ws_connect(pos_p['id'])
    call, ej = make_ws(sock)
    time.sleep(2)

# Cotizaciones button
result = ej("""
(function(){
  var btn = document.querySelector('button[data-menu=\"cotizaciones\"]');
  if (!btn) return JSON.stringify({error: 'NO_FOUND'});
  return JSON.stringify({
    display: getComputedStyle(btn).display,
    visible: btn.offsetParent !== null,
    text: btn.textContent.replace(/\\s+/g,' ').trim().slice(0, 30)
  });
})()
""")
print("Boton Cotizaciones:", result)

# Click
ej("var b=document.querySelector('button[data-menu=\"cotizaciones\"]');if(b)b.click();")
time.sleep(2)

screen = ej("""
(function(){
  var s = document.getElementById('screen-cotizaciones');
  if (!s) return JSON.stringify({error: 'NO_SCREEN'});
  var t = document.querySelector('#screen-cotizaciones .page-title');
  return JSON.stringify({
    hiddenClass: s.classList.contains('hidden'),
    visible: s.offsetParent !== null,
    title: t ? t.textContent : null
  });
})()
""")
print("Screen state:", screen)

# Screenshot
r = call("Page.captureScreenshot", {"format":"png"})
if r and r.get("data"):
    with open(r"D:\github\volvix-pos\cotizaciones-screen.png","wb") as f:
        f.write(base64.b64decode(r["data"]))
    print("Saved cotizaciones-screen.png")
sock.close()
