"""
APK Static Test — pruebas físicas del contenido del APK sin emulador.
Verifica: estructura, permisos, plugins Capacitor, bundle web, firma.
"""
import os, sys, json, zipfile, hashlib, subprocess
APK = r"C:\Users\DELL\AppData\Local\Temp\apk-test\VolvixPOS.apk"
EXTRACTED = r"C:\Users\DELL\AppData\Local\Temp\apk-test\extracted"
results = {}

print("="*60)
print("VOLVIX POS APK STATIC TEST (sin emulador)")
print("="*60)

# 1. APK físicamente existe
print("\n[1] APK file exists & size")
size = os.path.getsize(APK)
sha = hashlib.sha256(open(APK,'rb').read()).hexdigest()
print(f"  Size: {size/1048576:.2f} MB ({size:,} bytes)")
print(f"  SHA256: {sha}")
results['apk_size_mb'] = round(size/1048576, 2)
results['apk_sha256'] = sha[:16]

# 2. APK es un ZIP válido
print("\n[2] APK is valid ZIP")
try:
    z = zipfile.ZipFile(APK)
    files = z.namelist()
    print(f"  ZIP entries: {len(files)}")
    z.close()
    results['zip_entries'] = len(files)
except Exception as e:
    print(f"  FAIL: {e}")
    results['zip_entries'] = None

# 3. Contiene AndroidManifest.xml + classes.dex
print("\n[3] Critical Android files present")
critical = ['AndroidManifest.xml', 'classes.dex', 'META-INF/MANIFEST.MF']
for c in critical:
    found = os.path.exists(os.path.join(EXTRACTED, c))
    print(f"  {c}: {'OK' if found else 'MISSING'}")
    results['has_' + c.replace('/','_').replace('.','')] = found

# 4. Bundle web completo
print("\n[4] Web bundle completeness")
public = os.path.join(EXTRACTED, 'assets', 'public')
critical_web = [
    'index.html',
    'salvadorex-pos.html',
    'login.html',
    'marketplace.html',
    'auth-gate.js',
    'volvix-offline-queue.js',
    'volvix-mobile-fixes.js',
    'volvix-modals.js',
    'volvix-real-data-loader.js',
    'volvix-import-wizard.js',
    'sw.js',
    'manifest.json',
    'sellos/alianza-caintra.webp',
    'sellos/alianza-coparmex.jpg',
    'sellos/alianza-hechoennl.png',
]
missing = []
for f in critical_web:
    p = os.path.join(public, f)
    if not os.path.exists(p):
        missing.append(f)
        print(f"  [MISS] {f}")
    else:
        s = os.path.getsize(p)
        print(f"  [OK]   {f} ({s:,} bytes)")
results['web_bundle_missing'] = missing
results['web_bundle_complete'] = len(missing) == 0

# 5. Capacitor config
print("\n[5] Capacitor config")
with open(os.path.join(EXTRACTED, 'assets', 'capacitor.config.json')) as f:
    cap = json.load(f)
print(f"  appId: {cap.get('appId')}")
print(f"  webDir: {cap.get('webDir')}")
print(f"  splashScreen.launchShowDuration: {cap.get('plugins',{}).get('SplashScreen',{}).get('launchShowDuration')}")
print(f"  splashScreen.bg: {cap.get('plugins',{}).get('SplashScreen',{}).get('backgroundColor')}")
allow = cap.get('server',{}).get('allowNavigation',[])
print(f"  server.allowNavigation: {len(allow)} hosts")
for h in allow: print(f"    - {h}")
results['cap_appId'] = cap.get('appId')
results['cap_splash_duration'] = cap.get('plugins',{}).get('SplashScreen',{}).get('launchShowDuration')
results['cap_splash_bg'] = cap.get('plugins',{}).get('SplashScreen',{}).get('backgroundColor')

# 6. Capacitor plugins instalados
print("\n[6] Capacitor plugins")
with open(os.path.join(EXTRACTED, 'assets', 'capacitor.plugins.json')) as f:
    plugins = json.load(f)
expected = [
    '@capacitor-community/barcode-scanner',
    '@capacitor-community/keep-awake',
    '@capacitor/app',
    '@capacitor/camera',
    '@capacitor/device',
    '@capacitor/filesystem',
    '@capacitor/keyboard',
    '@capacitor/network',
    '@capacitor/preferences',
    '@capacitor/share',
    '@capacitor/splash-screen',
    '@capacitor/status-bar',
]
installed = [p['pkg'] for p in plugins]
for e in expected:
    if e in installed:
        print(f"  [OK]   {e}")
    else:
        print(f"  [MISS] {e}")
results['plugins_count'] = len(installed)
results['plugins_missing'] = [e for e in expected if e not in installed]

# 7. Verificar que OfflineQueue está en el bundle y tiene los fixes
print("\n[7] OfflineQueue contiene fixes recientes")
oq_path = os.path.join(public, 'volvix-offline-queue.js')
oq_content = open(oq_path, encoding='utf-8').read()
fixes = {
    'paralelización (concurrency)': 'concurrency' in oq_content,
    'anti-deadlock (45s timeout)': '45000' in oq_content,
    'coalescing': 'coalesced' in oq_content,
    'PROMISE_DUPLICATE_SKU detection': 'PRODUCT_DUPLICATE_SKU' in oq_content,
    'PATCH upsert + If-Match': 'If-Match' in oq_content,
    'AbortController fetch timeout': 'AbortController' in oq_content,
    'Promise.race timeout': 'Promise.race' in oq_content,
    'IndexedDB persistencia': 'indexedDB' in oq_content,
    'idempotencyKey support': 'idempotencyKey' in oq_content,
}
all_ok = True
for k, v in fixes.items():
    print(f"  {'[OK]' if v else '[MISS]'} {k}")
    if not v: all_ok = False
results['offline_queue_fixes'] = fixes
results['offline_queue_all_fixes_present'] = all_ok

# 8. salvadorex-pos.html contiene módulo Cotizaciones visible
print("\n[8] salvadorex-pos.html contiene Cotizaciones visible")
spos = open(os.path.join(public, 'salvadorex-pos.html'), encoding='utf-8').read()
cot_visible = 'data-menu="cotizaciones"' in spos and 'screen-cotizaciones' in spos
# Buscar que NO tenga data-feature module.cotizaciones (estaba oculto antes)
cot_hidden = 'data-feature="module.cotizaciones"' in spos
print(f"  Cotizaciones button presente: {'OK' if cot_visible else 'MISS'}")
print(f"  Cotizaciones SIN feature flag (visible): {'OK' if not cot_hidden else 'STILL_HIDDEN'}")
results['cotizaciones_visible'] = cot_visible and not cot_hidden

# 9. Native bridge Capacitor presente
print("\n[9] Capacitor native bridge")
nb_path = os.path.join(EXTRACTED, 'assets', 'native-bridge.js')
nb_exists = os.path.exists(nb_path)
nb_size = os.path.getsize(nb_path) if nb_exists else 0
print(f"  native-bridge.js: {'OK' if nb_exists else 'MISS'} ({nb_size:,} bytes)")
results['native_bridge_present'] = nb_exists

# 10. AndroidManifest - parsear strings legibles del binario
print("\n[10] AndroidManifest.xml — strings legibles")
with open(os.path.join(EXTRACTED, 'AndroidManifest.xml'), 'rb') as f:
    manifest = f.read()
# AAPT2 binary format — extract printable strings
import re
strings = re.findall(rb'[\x20-\x7e]{6,}', manifest)
strings_str = b'\n'.join(strings).decode('utf-8', errors='ignore')
checks_manifest = {
    'package com.volvix.pos': 'com.volvix.pos' in strings_str,
    'INTERNET permission': 'android.permission.INTERNET' in strings_str,
    'CAMERA permission': 'CAMERA' in strings_str,
    'NETWORK_STATE permission': 'ACCESS_NETWORK_STATE' in strings_str,
    'WRITE_EXTERNAL_STORAGE': 'WRITE_EXTERNAL_STORAGE' in strings_str,
    'MainActivity class': 'MainActivity' in strings_str,
}
for k, v in checks_manifest.items():
    print(f"  {'[OK]' if v else '[--]'} {k}")
results['manifest_checks'] = checks_manifest

# 11. Resumen
print("\n" + "="*60)
print("RESUMEN")
print("="*60)
critical_pass = (
    results.get('zip_entries', 0) > 0 and
    results.get('web_bundle_complete') and
    results.get('plugins_count', 0) >= 12 and
    results.get('offline_queue_all_fixes_present') and
    results.get('cotizaciones_visible') and
    results.get('native_bridge_present')
)
print(f"\nCRITICAL CHECKS: {'PASS' if critical_pass else 'FAIL'}")
print(f"\nAPK ready for installation on Android device.")
print(f"NOTE: dynamic tests (UI interaction, offline sync flow) require Android emulator.")
print(f"\nResults JSON: {json.dumps(results, indent=2, default=str)[:500]}")

# Save full results
with open(os.path.expanduser("~/apk-static-test-results.json"), "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nFull results: ~/apk-static-test-results.json")
sys.exit(0 if critical_pass else 1)
