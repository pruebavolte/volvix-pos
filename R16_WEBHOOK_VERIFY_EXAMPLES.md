# R16 — Webhook Signature Verification (Receiver Examples)

## Volvix outbound webhook contract

Each delivery sends:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `Volvix-Webhooks/1.0` |
| `X-Volvix-Signature` | `sha256=<hex>` — HMAC-SHA256 of the **raw body** with the endpoint `secret` |
| `X-Volvix-Timestamp` | Milliseconds since epoch when signed |

**Body** (JSON):
```json
{ "id": "<delivery_uuid>", "event": "sale.created", "ts": "ISO-8601",
  "tenant_id": "<uuid>", "data": { /* event payload */ } }
```

Signing routine (`api/index.js:2874`):
```js
function _webhookSign(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
}
```

Receivers MUST compute HMAC-SHA256 over the **raw, unparsed** body bytes and use a **constant-time** comparison. Reject if the timestamp is older than ~5 minutes to defend against replay.

---

## Node.js (Express)

```js
const crypto = require('crypto');
const express = require('express');
const app = express();

app.post('/volvix-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.get('X-Volvix-Signature') || '';
  const ts  = Number(req.get('X-Volvix-Timestamp') || 0);
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return res.status(408).end();

  const expected = 'sha256=' + crypto.createHmac('sha256', process.env.VOLVIX_SECRET)
                                     .update(req.body).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end();

  const event = JSON.parse(req.body.toString('utf8'));
  console.log('verified', event.event, event.id);
  res.status(204).end();
});
```

## Python (Flask)

```python
import hmac, hashlib, time, os
from flask import Flask, request, abort

app = Flask(__name__)
SECRET = os.environ['VOLVIX_SECRET'].encode()

@app.post('/volvix-webhook')
def hook():
    sig = request.headers.get('X-Volvix-Signature', '')
    ts  = int(request.headers.get('X-Volvix-Timestamp', '0'))
    if abs(time.time()*1000 - ts) > 5*60*1000:
        abort(408)
    expected = 'sha256=' + hmac.new(SECRET, request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        abort(401)
    return '', 204
```

## PHP

```php
<?php
$secret = getenv('VOLVIX_SECRET');
$body   = file_get_contents('php://input');
$sig    = $_SERVER['HTTP_X_VOLVIX_SIGNATURE'] ?? '';
$ts     = (int)($_SERVER['HTTP_X_VOLVIX_TIMESTAMP'] ?? 0);

if (abs(round(microtime(true)*1000) - $ts) > 5*60*1000) { http_response_code(408); exit; }
$expected = 'sha256=' . hash_hmac('sha256', $body, $secret);
if (!hash_equals($expected, $sig)) { http_response_code(401); exit; }
http_response_code(204);
```

## Go

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "net/http"
    "os"
    "strconv"
    "time"
)

func handler(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    ts, _  := strconv.ParseInt(r.Header.Get("X-Volvix-Timestamp"), 10, 64)
    if abs(time.Now().UnixMilli()-ts) > 5*60*1000 { w.WriteHeader(408); return }

    mac := hmac.New(sha256.New, []byte(os.Getenv("VOLVIX_SECRET")))
    mac.Write(body)
    expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
    if !hmac.Equal([]byte(expected), []byte(r.Header.Get("X-Volvix-Signature"))) {
        w.WriteHeader(401); return
    }
    w.WriteHeader(204)
}

func abs(x int64) int64 { if x < 0 { return -x }; return x }

func main() { http.HandleFunc("/volvix-webhook", handler); http.ListenAndServe(":8080", nil) }
```

## Bash (openssl)

Verify a captured payload (`body.json`) with secret `$SECRET`:

```bash
EXPECTED="sha256=$(openssl dgst -sha256 -hmac "$SECRET" -hex < body.json | awk '{print $2}')"
[ "$EXPECTED" = "$X_VOLVIX_SIGNATURE" ] && echo OK || echo MISMATCH
```

One-liner inside a CGI / handler:

```bash
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$VOLVIX_SECRET" -hex | awk '{print "sha256="$2}')
[ "$SIG" = "$HTTP_X_VOLVIX_SIGNATURE" ] || { echo "Status: 401"; echo; exit; }
```

---

## Graceful fallback

If the `webhook_endpoints` table is absent, `dispatchWebhook` swallows the lookup error (try/catch in `setImmediate`, `api/index.js:2964`) so business flows (sales, refunds) keep working. The CRUD handlers return the underlying Supabase error to admin callers — that surfaces the missing table without crashing the API.
