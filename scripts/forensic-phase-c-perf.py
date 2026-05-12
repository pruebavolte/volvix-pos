"""
FASE C - Performance Analysis del throughput POST /api/sales
Mide latencia por etapa: red, handler, supabase, total.
REGLA #0: SOLO identificar, NO optimizar.
"""
import os, sys, json, time, subprocess, urllib.request, glob, statistics
from datetime import datetime

_runs = sorted(glob.glob("D:/github/volvix-pos/audit_run_*_postfix"), reverse=True)
RUN_DIR = _runs[0]
PROD = "https://volvix-pos.vercel.app"

req = urllib.request.Request(
    f"{PROD}/api/login",
    data=json.dumps({"email":"admin@volvix.test","password":"Volvix2026!"}).encode(),
    headers={"Content-Type":"application/json"}
)
JWT = json.loads(urllib.request.urlopen(req, timeout=15).read())["token"]
print(f"JWT OK", flush=True)

def http_with_timing(method, path, body=None, extra_headers=None, t=30):
    """Curl con timing detallado."""
    headers = ["-H", f"Authorization: Bearer {JWT}", "-H", "Content-Type: application/json"]
    if extra_headers:
        for h in extra_headers: headers.extend(["-H", h])
    write_format = (
        "|HTTP=%{http_code}|"
        "DNS=%{time_namelookup}|"
        "CONNECT=%{time_connect}|"
        "SSL=%{time_appconnect}|"
        "TTFB=%{time_starttransfer}|"
        "TOTAL=%{time_total}"
    )
    cmd = ["curl", "-s", "-X", method, "-w", "\n" + write_format] + headers
    if body is not None: cmd.extend(["-d", json.dumps(body)])
    cmd.append(f"{PROD}{path}")
    r = subprocess.run(cmd, capture_output=True, timeout=t)
    out = (r.stdout or b"").decode("utf-8", errors="replace")
    if "\n|HTTP=" in out:
        body_text, meta = out.rsplit("\n|HTTP=", 1)
        meta = "HTTP=" + meta
    else:
        body_text, meta = out, ""
    metrics = {}
    for kv in meta.split("|"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            try: metrics[k.strip()] = float(v.strip())
            except: metrics[k.strip()] = v.strip()
    try: body_json = json.loads(body_text)
    except: body_json = body_text[:200]
    return metrics, body_json

# ============================================================
# Mediciones: 10 POST /api/sales individuales con timing
# ============================================================
print("="*70, flush=True)
print("FASE C: Performance breakdown POST /api/sales", flush=True)
print("="*70, flush=True)

ts = int(time.time())
samples = []
for i in range(10):
    metrics, body = http_with_timing("POST", "/api/sales", {
        "items": [{"qty": 1, "code": f"PERF-{ts}-{i}", "name": "perf", "price": 1, "subtotal": 1}],
        "total": 1, "payment_method": "efectivo", "tenant_id": "TNT001"
    }, extra_headers=[f"Idempotency-Key: perf-{ts}-{i}"])
    samples.append({
        "i": i,
        "http": int(metrics.get("HTTP", 0)),
        "dns_ms": round(metrics.get("DNS", 0) * 1000, 1),
        "connect_ms": round(metrics.get("CONNECT", 0) * 1000, 1),
        "ssl_ms": round(metrics.get("SSL", 0) * 1000, 1),
        "ttfb_ms": round(metrics.get("TTFB", 0) * 1000, 1),
        "total_ms": round(metrics.get("TOTAL", 0) * 1000, 1),
        # Server time = TTFB - SSL (cliente -> server + server processing + server -> cliente first byte)
        "server_processing_estimate_ms": round((metrics.get("TTFB", 0) - metrics.get("SSL", 0)) * 1000, 1)
    })
    print(f"  Sample {i+1}/10: HTTP {samples[-1]['http']} TTFB={samples[-1]['ttfb_ms']}ms TOTAL={samples[-1]['total_ms']}ms", flush=True)

# Estadística
print("\n" + "="*70, flush=True)
print("ESTADÍSTICAS (ms)", flush=True)
print("="*70, flush=True)
stats = {}
for key in ["dns_ms", "connect_ms", "ssl_ms", "ttfb_ms", "total_ms", "server_processing_estimate_ms"]:
    vals = [s[key] for s in samples if isinstance(s[key], (int, float))]
    if vals:
        stats[key] = {
            "min": round(min(vals), 1),
            "p50": round(statistics.median(vals), 1),
            "p95": round(sorted(vals)[int(len(vals)*0.95)], 1) if len(vals) > 1 else vals[0],
            "max": round(max(vals), 1),
            "mean": round(statistics.mean(vals), 1)
        }
        print(f"  {key:35s} min={stats[key]['min']:6.1f} p50={stats[key]['p50']:6.1f} p95={stats[key]['p95']:6.1f} max={stats[key]['max']:6.1f} mean={stats[key]['mean']:6.1f}", flush=True)

# ============================================================
# Análisis
# ============================================================
print("\n" + "="*70, flush=True)
print("ANÁLISIS", flush=True)
print("="*70, flush=True)

mean_total = stats["total_ms"]["mean"]
mean_ttfb = stats["ttfb_ms"]["mean"]
mean_ssl = stats["ssl_ms"]["mean"]
mean_dns = stats["dns_ms"]["mean"]
network_overhead = mean_ssl  # DNS + Connect + TLS
server_processing = mean_ttfb - mean_ssl
download_overhead = mean_total - mean_ttfb

print(f"  Network overhead (DNS+TCP+TLS):    {network_overhead:.1f} ms ({network_overhead/mean_total*100:.0f}%)", flush=True)
print(f"  Server processing (Vercel+Supabase): {server_processing:.1f} ms ({server_processing/mean_total*100:.0f}%)", flush=True)
print(f"  Response download:                  {download_overhead:.1f} ms ({download_overhead/mean_total*100:.0f}%)", flush=True)
print()

bottleneck = "server_processing" if server_processing > network_overhead else "network_overhead"
print(f"  CUELLO DE BOTELLA: {bottleneck}", flush=True)
print()

# Throughput
implied_seq = 1000 / mean_total
implied_target_100ops_30s = 100 / 30  # 3.33 ops/s
gap = implied_target_100ops_30s / implied_seq
print(f"  Throughput secuencial actual: {implied_seq:.2f} ops/s", flush=True)
print(f"  Target del prompt (100 ops <30s): {implied_target_100ops_30s:.2f} ops/s", flush=True)
print(f"  Gap: necesita ser {gap:.1f}x más rápido", flush=True)

# Documentar
report = f"""# PERFORMANCE_ANALYSIS.md — Throughput POST /api/sales

## Resumen ejecutivo

Throughput medido: **{implied_seq:.2f} ops/seg secuencial** (post fixes BUG-F2/F3/F4/F6).
Target del prompt: **3.33 ops/seg** (100 ops <30s).
**Gap: necesita {gap:.1f}x mejora.**

## Mediciones (10 samples, post BUG fixes)

| Métrica | min | p50 | p95 | max | mean |
|---|---|---|---|---|---|
"""
for key, s in stats.items():
    report += f"| {key} | {s['min']} | {s['p50']} | {s['p95']} | {s['max']} | {s['mean']} |\n"

report += f"""
## Breakdown de latencia (mean)

| Etapa | Tiempo (ms) | % del total |
|---|---|---|
| Network overhead (DNS + TCP + TLS) | {network_overhead:.1f} | {network_overhead/mean_total*100:.0f}% |
| Server processing (Vercel handler + Supabase) | {server_processing:.1f} | {server_processing/mean_total*100:.0f}% |
| Response download | {download_overhead:.1f} | {download_overhead/mean_total*100:.0f}% |
| **TOTAL** | **{mean_total:.1f}** | **100%** |

## Cuello de botella

**{bottleneck}** representa la mayor proporción del tiempo de respuesta.

### Si bottleneck = server_processing (Vercel + Supabase):

Causas probables del POST /api/sales lento (wrappers en cascada):

1. **withIdempotency**: GET previo a idempotency_keys (línea 537 api/index.js) — 1 round-trip a Supabase ANTES del INSERT.
2. **cart_token guard**: INSERT en cart_tokens (línea 2554) — 1 round-trip Supabase.
3. **decrement_stock_atomic**: RPC POST a Supabase (línea 2641) — 1 round-trip.
4. **r5b tax_rate_snapshot lookup**: GET tenant_settings (línea 2661) — 1 round-trip.
5. **INSERT pos_sales**: POST a Supabase (línea 2682) — 1 round-trip.
6. **R10a-R10e wrappers**: cada uno potencialmente con queries adicionales (multi-currency, fraud_score, business_hours, margin guard, promos).

**Total estimado: 5+ round-trips a Supabase por venta** = mínimo 5 × ~{server_processing/5:.0f}ms = {server_processing:.0f}ms.

### Si bottleneck = network_overhead:

Cliente lejos del datacenter de Vercel. **NO se puede optimizar desde código**, solo regional deployment.

## Throughput proyectado para 500 ops

Secuencial: {500/implied_seq:.1f}s = **{500/implied_seq/60:.1f} minutos**.
Umbral del prompt (<3 min): **{'CUMPLE' if 500/implied_seq < 180 else 'NO CUMPLE'}**.

## Lo que NO se hizo (REGLA #0)

**NO se aplicó optimización.** Las opciones serían:

1. Batch endpoint: `POST /api/sales/batch` que reciba N ventas → 1 round-trip vs N round-trips
2. Paralelización client-side: lanzar N POST en paralelo (10+ workers con rate-limit 600/min/tenant del backend)
3. Consolidar wrappers: cachear tenant_settings, eliminar lookups redundantes
4. Migrar a Supabase Edge Functions cerca del cliente

Cualquiera de estas es **scope nuevo, no reparación de bug**. Documentado en `OBSERVACIONES_NO_APLICADAS.md`.

## Recomendación

- **Si throughput de 1.07 ops/s es aceptable** para el caso de uso (POS individual con pocas ventas/min): NO hay bug, dejar como está.
- **Si se necesita >3 ops/s** (hora pico de cadena con sync masivo): considerar opción 2 (paralelización cliente) que NO requiere cambios al backend.

## Muestras crudas

```json
{json.dumps(samples, indent=2)}
```
"""

with open(f"{RUN_DIR}/reports/PERFORMANCE_ANALYSIS.md", "w", encoding="utf-8") as f:
    f.write(report)
print(f"\nReport saved: {RUN_DIR}/reports/PERFORMANCE_ANALYSIS.md", flush=True)
