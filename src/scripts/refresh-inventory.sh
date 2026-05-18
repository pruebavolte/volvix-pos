#!/usr/bin/env bash
# Regenera SYSTEM-INVENTORY.json escaneando el repo. Solo ejecutar
# manualmente o si pasaron >7 días desde generated_at.
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

python - <<'PYEOF'
import re, json, os, datetime, glob

ROOT = '.'
out = {
  "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "repo_root": os.path.abspath(ROOT),
  "deploy_url": "https://volvix-pos.vercel.app",
}

out["subsystems"] = [
  {"name":"Volvix Hub Landing","html":"volvix-hub-landing.html","role_required":"public","public":True,"purpose":"Marketing / landing principal"},
  {"name":"Login Volvix","html":"login.html","role_required":"public","public":True,"purpose":"Auth gateway central"},
  {"name":"Volvix Admin SaaS","html":"volvix-admin-saas.html","role_required":"superadmin","public":False,"purpose":"Dueño de plataforma"},
  {"name":"Volvix MEGA Dashboard","html":"volvix-mega-dashboard.html","role_required":"superadmin","public":False,"purpose":"KPIs globales multi-tenant"},
  {"name":"Owner Panel","html":"volvix_owner_panel_v7.html","role_required":"owner","public":False,"purpose":"Dueño de UN negocio individual"},
  {"name":"SalvadoreX POS","html":"salvadorex_web_v25.html","role_required":"cashier|manager|owner","public":False,"purpose":"Punto de venta"},
  {"name":"MultiPOS Suite","html":"multipos_suite_v3.html","role_required":"manager","public":False,"purpose":"Multi-sucursal"},
  {"name":"KDS Kitchen","html":"volvix-kds.html","role_required":"kitchen","public":False,"purpose":"Pantalla de cocina"},
  {"name":"Kiosko","html":"volvix-kiosk.html","role_required":"kiosk","public":True,"purpose":"Self-service en local"},
  {"name":"Customer Portal","html":"volvix-customer-portal.html","role_required":"customer","public":False,"purpose":"Comprador final"},
  {"name":"Vendor Portal","html":"volvix-vendor-portal.html","role_required":"vendor","public":False,"purpose":"Proveedor"},
  {"name":"Marketplace","html":"marketplace.html","role_required":"public","public":True,"purpose":"Selector de giro"},
  {"name":"GDPR Portal","html":"volvix-gdpr-portal.html","role_required":"public","public":True,"purpose":"Solicitudes Art.15/17/20"},
  {"name":"Fraud Dashboard","html":"public/volvix-fraud-dashboard.html","role_required":"superadmin","public":False,"purpose":"Vigilancia de fraude"},
]

endpoints = []
api_file = 'api/index.js'
if os.path.exists(api_file):
  with open(api_file, 'r', encoding='utf-8') as f:
    for ln_no, line in enumerate(f, 1):
      m = re.search(r"handlers\[['\"](GET|POST|PUT|DELETE|PATCH)\s+(/api/[a-zA-Z0-9_:/\-]+)['\"]", line)
      if m:
        endpoints.append({"method": m.group(1), "path": m.group(2), "file": api_file, "line": ln_no})
seen = set(); uniq = []
for e in endpoints:
  key = (e['method'], e['path'])
  if key not in seen:
    seen.add(key); uniq.append(e)
out["endpoints"] = uniq
out["endpoints_total"] = len(uniq)

tables = set()
for src in ['api/index.js', 'server.js']:
  if os.path.exists(src):
    with open(src, 'r', encoding='utf-8') as f:
      txt = f.read()
    for m in re.finditer(r"(?:supabaseRequest|_sbReq)\(\s*['\"](?:GET|POST|PATCH|DELETE)['\"],\s*['\"`]\\?[/]?([a-zA-Z_][a-zA-Z0-9_]*)", txt):
      tables.add(m.group(1))
    for m in re.finditer(r"['\"`][\\/]([a-z_][a-zA-Z0-9_]*)\?(select|order|limit|insert|tenant_id|id=)", txt):
      tables.add(m.group(1))
out["db_tables"] = sorted([{"name": t} for t in tables if not t.startswith('_')], key=lambda x: x['name'])
out["db_tables_total"] = len(out["db_tables"])
out["roles"] = ["superadmin","admin","owner","manager","cashier","customer","vendor","kiosk"]

i18n_cov = {"total_in_code": 0, "covered_in_es": 0, "covered_in_en": 0}
es_count = 0
i18n_file = 'volvix-i18n-wiring.js'
if os.path.exists(i18n_file):
  with open(i18n_file, 'r', encoding='utf-8') as f:
    es_count = len(re.findall(r"^\s+\"[a-z]+\.[a-z._]+\":\s*\"", f.read(), re.MULTILINE))
en_count = 0
en_file = 'i18n/en.json'
if os.path.exists(en_file):
  with open(en_file, 'r', encoding='utf-8') as f:
    en_count = sum(1 for line in f if re.match(r'\s+"[a-z]+\.[a-z._]+":\s*"', line))
total_html_strings = 0
for h in glob.glob('*.html'):
  if h in ('docs.html','BITACORA_LIVE.html','MATRIZ_PRUEBAS_LOCAL.html','MATRIZ_PRUEBAS_LOCAL_v1_backup.html','volvix-qa-scenarios.html'):
    continue
  try:
    with open(h, 'r', encoding='utf-8') as f:
      txt = f.read()
    matches = re.findall(r">\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,60})\s*<", txt)
    total_html_strings += len(set(matches))
  except: pass
i18n_cov["total_in_code"] = total_html_strings
i18n_cov["covered_in_es"] = es_count
i18n_cov["covered_in_en"] = en_count
i18n_cov["coverage_es_pct"] = round(100*es_count/total_html_strings, 1) if total_html_strings else 0
i18n_cov["coverage_en_pct"] = round(100*en_count/total_html_strings, 1) if total_html_strings else 0
out["i18n_strings"] = i18n_cov
out["subsystems_total"] = len(out["subsystems"])

with open('SYSTEM-INVENTORY.json','w',encoding='utf-8') as f:
  json.dump(out, f, indent=2, ensure_ascii=False)

print(f"refreshed: {out['subsystems_total']} subs / {out['endpoints_total']} endpoints / {out['db_tables_total']} tables")
print(f"i18n cov: es {i18n_cov['coverage_es_pct']}% | en {i18n_cov['coverage_en_pct']}%")
PYEOF
