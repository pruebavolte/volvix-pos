"""Mini server que sirve el bundle del APK + proxy /api/* a Vercel.
Igual al server que tiene el .exe, simula lo que Capacitor hace en Android."""
import http.server, socketserver, os, sys, json, urllib.request, urllib.error, threading, time

BUNDLE = r"C:\Users\DELL\AppData\Local\Temp\apk-test\extracted\assets\public"
PROD_BASE = "https://volvix-pos.vercel.app"
PORT = int(os.environ.get('PORT', '0'))

class APKHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kw):
        super().__init__(*args, directory=BUNDLE, **kw)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/api/'): return self.proxy()
        return super().do_GET()
    def do_POST(self): return self.proxy() if self.path.startswith('/api/') else self.send_error(405)
    def do_PATCH(self): return self.proxy() if self.path.startswith('/api/') else self.send_error(405)
    def do_PUT(self): return self.proxy() if self.path.startswith('/api/') else self.send_error(405)
    def do_DELETE(self): return self.proxy() if self.path.startswith('/api/') else self.send_error(405)
    def proxy(self):
        try:
            url = PROD_BASE + self.path
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else None
            hdrs = {k: v for k, v in self.headers.items()
                    if k.lower() not in ('host','content-length','connection')}
            req = urllib.request.Request(url, data=body, method=self.command, headers=hdrs)
            try:
                r = urllib.request.urlopen(req, timeout=5)
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() in ('content-type','authorization'):
                        self.send_header(k, v)
                self.end_headers(); self.wfile.write(data)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type','application/json')
                self.end_headers(); self.wfile.write(e.read())
            except Exception as e:
                self.send_response(503)
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error":"offline","msg":str(e)[:100]}).encode())
        except Exception as e:
            self.send_error(500, str(e))

server = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), APKHandler)
server.daemon_threads = True
port = server.server_address[1]
print(f"APK_SERVER_PORT={port}", flush=True)
print(f"Serving {BUNDLE}", flush=True)
print(f"Open: http://127.0.0.1:{port}/index.html", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
