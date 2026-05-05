#!/usr/bin/env bash
# Load / Performance test for volvix-pos.vercel.app
# Uses python+threads (Windows-friendly, no fork bombs)
# Measures p50/p95/p99 latency, detects >5s timeouts and 5xx
set -u
BASE="${BASE:-https://volvix-pos.vercel.app}"
TOKEN="${TOKEN:-PLACEHOLDER}"
OUT_DIR="$(dirname "$0")/results"
mkdir -p "$OUT_DIR"

python - "$BASE" "$TOKEN" "$OUT_DIR" <<'PY'
import sys,json,time,urllib.request,urllib.error,ssl,threading,csv,os
BASE,TOKEN,OUT=sys.argv[1],sys.argv[2],sys.argv[3]
ctx=ssl.create_default_context()

def req(method,path,body=None,timeout=10):
    url=BASE+path
    data=None
    headers={"Authorization":f"Bearer {TOKEN}","Content-Type":"application/json","User-Agent":"loadtest/1.0"}
    if body is not None:
        data=json.dumps(body).encode()
    r=urllib.request.Request(url,data=data,headers=headers,method=method)
    t0=time.time()
    code=0
    try:
        with urllib.request.urlopen(r,timeout=timeout,context=ctx) as resp:
            resp.read(64)
            code=resp.status
    except urllib.error.HTTPError as e:
        code=e.code
    except Exception:
        code=0
    return code,(time.time()-t0)*1000.0

def burst(label,method,path,n,body=None,concurrency=None):
    concurrency=concurrency or n
    print(f">>> {label} {method} {path} x{n} (conc {concurrency})")
    results=[]; lock=threading.Lock()
    sem=threading.Semaphore(concurrency)
    def worker():
        with sem:
            c,t=req(method,path,body)
            with lock: results.append((c,t))
    ths=[threading.Thread(target=worker) for _ in range(n)]
    for t in ths: t.start()
    for t in ths: t.join()
    return results

def pct(vals,p):
    if not vals: return 0
    s=sorted(vals); k=int(round(p/100*(len(s)-1)))
    return s[max(0,min(len(s)-1,k))]

def stats(label,res):
    lat=[t for _,t in res]
    codes=[c for c,_ in res]
    ok=sum(1 for c in codes if 200<=c<300)
    e5=sum(1 for c in codes if 500<=c<600)
    timeouts=sum(1 for t in lat if t>5000)
    p50=pct(lat,50); p95=pct(lat,95); p99=pct(lat,99)
    line=f"  total={len(res)} 2xx={ok} 5xx={e5} >5s={timeouts} p50={p50:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms"
    print(line)
    return {"label":label,"total":len(res),"ok2xx":ok,"e5xx":e5,"timeouts_gt5s":timeouts,
            "p50_ms":round(p50,1),"p95_ms":round(p95,1),"p99_ms":round(p99,1),
            "codes":dict((str(c),codes.count(c)) for c in set(codes))}

# Cold start
print(">>> cold start /api/health")
c0,t0=req("GET","/api/health")
print(f"cold: {c0} {t0:.0f}ms")

# Warm a bit
warm_results=[]
for _ in range(3):
    c,t=req("GET","/api/health"); warm_results.append(t)
warm_avg=sum(warm_results)/len(warm_results)
print(f"warm avg (3 sequential): {warm_avg:.0f}ms")

all_stats=[]
all_stats.append(stats("products_get",  burst("products_get","GET","/api/products",100)))
all_stats.append(stats("sales_post",    burst("sales_post","POST","/api/sales",50,
    {"items":[{"sku":"X","qty":1,"price":10}],"total":10})))
all_stats.append(stats("health_get",    burst("health_get","GET","/api/health",20)))
all_stats.append(stats("login_post",    burst("login_post","POST","/api/login",20,
    {"email":"admin@volvix.test","password":"x"})))

with open(os.path.join(OUT,"summary.csv"),"w",newline="") as f:
    w=csv.writer(f)
    w.writerow(["label","total","2xx","5xx","timeouts_gt5s","p50_ms","p95_ms","p99_ms"])
    for s in all_stats:
        w.writerow([s["label"],s["total"],s["ok2xx"],s["e5xx"],s["timeouts_gt5s"],s["p50_ms"],s["p95_ms"],s["p99_ms"]])

with open(os.path.join(OUT,"summary.json"),"w") as f:
    json.dump({"base":BASE,"cold_ms":round(t0,1),"cold_code":c0,
               "warm_avg_ms":round(warm_avg,1),"runs":all_stats},f,indent=2)

print("\nWrote",os.path.join(OUT,"summary.json"))
PY
