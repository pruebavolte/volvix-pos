#!/usr/bin/env bash
# B5 — Mide cobertura i18n contra strings visibles de pantallas críticas
set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

python <<'PYEOF'
import re, json
PAGES = [
  'login.html', 'salvadorex-pos.html', 'volvix-mega-dashboard.html',
  'volvix-admin-saas.html', 'volvix-owner-panel.html',
  'volvix-vendor-portal.html', 'volvix-customer-portal.html',
  'marketplace.html', 'volvix-hub-landing.html'
]

# 1. Strings visibles en HTMLs (texto entre tags, no en JS/CSS)
def strip_non_visible(html):
  html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S | re.I)
  html = re.sub(r'<style\b[^>]*>.*?</style>', '', html, flags=re.S | re.I)
  html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
  return html

visible = set()
for p in PAGES:
  try:
    txt = open(p, encoding='utf-8').read()
    txt = strip_non_visible(txt)
    # >TEXT< con caracteres ES
    for m in re.findall(r'>\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ./,\-]{2,40})\s*<', txt):
      m = m.strip()
      # filtrar: solo dígitos, símbolos, urls, emails
      if not m or m.isdigit(): continue
      if re.match(r'^[\d\.\,\s\-/$%]+$', m): continue
      if '@' in m and ' ' not in m: continue
      if 'http' in m.lower() or '.js' in m or '.css' in m: continue
      visible.add(m)
  except FileNotFoundError: pass

# 2. Strings cubiertos en es: dict
es_dict = set()
try:
  txt = open('volvix-i18n-wiring.js', encoding='utf-8').read()
  for m in re.findall(r'"[a-z]+\.[a-z._]+"\s*:\s*"([^"]+)"', txt):
    es_dict.add(m.strip())
except: pass

# 3. Strings cubiertos en en.json
en_dict = set()
try:
  d = json.load(open('i18n/en.json', encoding='utf-8'))
  en_dict = set(v.strip() for v in d.values() if isinstance(v, str))
except: pass

# 4. Calcular cobertura: visible está cubierto si su lowercase está en dict
def cov(visible, dict_):
  dict_lower = set(s.lower() for s in dict_)
  covered = sum(1 for v in visible if v.lower() in dict_lower)
  return covered, len(visible)

es_cov, total = cov(visible, es_dict)
# en_cov mide cuántas strings ES tienen una traducción EN (no exactly visible)
en_cov_ratio = (len(en_dict) / len(es_dict) * 100) if es_dict else 0

print(f"Strings UI visibles en pantallas criticas: {total}")
print(f"Cubiertos por dict ES: {es_cov} ({es_cov*100//max(total,1)}%)")
print(f"Tamaño dict ES: {len(es_dict)} strings")
print(f"Tamaño dict EN: {len(en_dict)} strings")
print(f"Ratio EN/ES: {en_cov_ratio:.0f}%")

# 5. Imprimir 30 strings UI más comunes NO cubiertos (para extender dict)
not_covered = sorted(s for s in visible if s.lower() not in set(d.lower() for d in es_dict))
print(f"\nTop 30 strings NO cubiertos en es: dict (orden alfabético):")
for s in not_covered[:30]:
  print(f"  - {s!r}")

# 6. Exit code: 0 si cobertura >= 70%, 1 si menos
import sys
pct = es_cov*100//max(total,1)
sys.exit(0 if pct >= 70 else 1)
PYEOF
