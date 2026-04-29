#!/usr/bin/env node
/* ============================================================
   VOLVIX POS  Mobile build pipeline (Capacitor)
   ============================================================
   Empaqueta la PWA https://volvix-pos.vercel.app como app nativa
   Android (APK/AAB) y iOS (IPA, requiere macOS + Xcode).

   Comandos rapidos:
     node mobile-build.js help              # esta ayuda
     node mobile-build.js doctor            # diagnostica el entorno
     node mobile-build.js install           # instala @capacitor/* + plugins
     node mobile-build.js init              # cap add android (+ ios en mac)
     node mobile-build.js sync              # cap sync (web -> nativo)
     node mobile-build.js android-debug     # APK debug (no firma)
     node mobile-build.js android-release   # APK release (keystore)
     node mobile-build.js android-bundle    # AAB para Google Play
     node mobile-build.js ios               # abre Xcode (mac)
     node mobile-build.js clean             # limpia outputs

   Aliases con dos puntos (compatibilidad con scripts npm previos):
     android:debug, android:release, android:bundle

   Outputs:
     APK debug   -> android/app/build/outputs/apk/debug/app-debug.apk
     APK release -> android/app/build/outputs/apk/release/app-release.apk
     AAB         -> android/app/build/outputs/bundle/release/app-release.aab
     IPA         -> ios/App/build/  (via Xcode Archive)
============================================================ */

const { spawn, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ----------------------------- consts -----------------------------

const isWin    = process.platform === 'win32';
const isMac    = process.platform === 'darwin';
const isLinux  = process.platform === 'linux';
const gradleW  = isWin ? 'gradlew.bat' : './gradlew';

const COLOR = {
  reset:  '\x1b[0m',
  gray:   '\x1b[90m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};

const CAP_DEPS = [
  '@capacitor/core',
  '@capacitor/cli',
  '@capacitor/android',
  '@capacitor/ios',
];

const CAP_PLUGINS = [
  '@capacitor/splash-screen',
  '@capacitor/status-bar',
  '@capacitor/keyboard',
  '@capacitor/network',
  '@capacitor/share',
  '@capacitor/preferences',     // sucesor moderno de @capacitor/storage
  '@capacitor/camera',
  '@capacitor/geolocation',
  '@capacitor/app',
  '@capacitor/device',
  '@capacitor/filesystem',
  '@capacitor/keep-awake',
  '@capacitor-community/barcode-scanner',
];

// ----------------------------- helpers -----------------------------

function log(msg, color = 'reset') {
  process.stdout.write(`${COLOR[color] || ''}${msg}${COLOR.reset}\n`);
}

function header(title) {
  log('', 'reset');
  log(`=== ${title} ===`, 'cyan');
  log('', 'reset');
}

function ok(msg)   { log(`  ok  ${msg}`, 'green'); }
function warn(msg) { log(`  !!  ${msg}`, 'yellow'); }
function fail(msg) { log(`  xx  ${msg}`, 'red'); }

function exists(p) {
  return fs.existsSync(path.resolve(p));
}

/**
 * Streams stdout/stderr from a child process. Returns exit code via promise.
 * Replaces execSync for long-running commands so the user sees live output.
 */
function spawnStreamed(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    log(`${COLOR.gray}$ ${cmd} ${args.join(' ')}${COLOR.reset}`);
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: isWin,           // necesario en Windows para .cmd / .bat
      ...opts,
    });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      fail(`spawn error: ${err.message}`);
      resolve(127);
    });
  });
}

/** Sync wrapper used solo para checks rapidos (sin streaming). */
function safeRun(cmd) {
  try { execSync(cmd, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function envVar(name) {
  return process.env[name] && process.env[name].trim() ? process.env[name] : '';
}

function checkPrereqs(forAndroid = true) {
  const problems = [];
  if (forAndroid) {
    if (!safeRun('java -version')) {
      problems.push({
        what: 'JDK 17 no instalado (java -version falla)',
        fix:  'Instala Temurin JDK 17: https://adoptium.net/temurin/releases/?version=17',
      });
    }
    if (!envVar('ANDROID_HOME') && !envVar('ANDROID_SDK_ROOT')) {
      problems.push({
        what: 'ANDROID_HOME / ANDROID_SDK_ROOT no definidos',
        fix:  'Instala Android Studio y agrega: ANDROID_HOME=%LOCALAPPDATA%\\Android\\Sdk',
      });
    }
    if (!envVar('JAVA_HOME')) {
      problems.push({
        what: 'JAVA_HOME no definido',
        fix:  'Define JAVA_HOME al directorio raiz de tu JDK 17',
      });
    }
  }
  return problems;
}

function printPrereqProblems(problems) {
  if (!problems.length) return false;
  fail('Faltan prerequisitos:');
  for (const p of problems) {
    log(`  - ${p.what}`, 'red');
    log(`    fix: ${p.fix}`, 'gray');
  }
  log('', 'reset');
  return true;
}

// ----------------------------- commands -----------------------------

async function doctor() {
  header('Volvix POS  Mobile doctor');

  const checks = [
    ['Node',          'node --version'],
    ['npm',           'npm --version'],
    ['npx cap',       'npx cap --version'],
    ['Java (JDK 17)', 'java -version'],
    ['Gradle',        'gradle --version'],
    ['Xcode (macOS)', isMac ? 'xcodebuild -version' : null],
    ['Cocoapods',     isMac ? 'pod --version' : null],
  ];

  for (const [name, cmd] of checks) {
    if (!cmd) {
      warn(`${name.padEnd(15)} skip (no aplica en ${process.platform})`);
      continue;
    }
    const present = safeRun(cmd);
    (present ? ok : fail)(`${name.padEnd(15)} ${present ? 'OK' : 'FALTA'}`);
  }

  log('', 'reset');
  log('Variables de entorno:', 'bold');
  for (const v of ['ANDROID_HOME', 'ANDROID_SDK_ROOT', 'JAVA_HOME']) {
    const val = envVar(v);
    (val ? ok : warn)(`${v.padEnd(18)} ${val || '(vacio)'}`);
  }

  log('', 'reset');
  log('Archivos clave:', 'bold');
  const files = [
    ['capacitor.config.json',           'capacitor.config.json'],
    ['android project (real)',          'android/app/build.gradle'],
    ['android project (placeholder)',   'android/build.gradle'],
    ['ios project (real, mac only)',    'ios/App/App.xcworkspace'],
    ['node_modules/@capacitor/core',    'node_modules/@capacitor/core'],
    ['node_modules/@capacitor/cli',     'node_modules/@capacitor/cli'],
    ['node_modules/@capacitor/android', 'node_modules/@capacitor/android'],
  ];
  for (const [label, p] of files) {
    (exists(p) ? ok : warn)(`${label.padEnd(34)} ${exists(p) ? 'presente' : 'ausente'}`);
  }

  log('', 'reset');
  const problems = checkPrereqs(true);
  if (problems.length) {
    warn('Tu entorno aun no puede compilar Android. Detalles:');
    printPrereqProblems(problems);
  } else {
    ok('Entorno listo para android-debug.');
  }
}

async function install() {
  header('Instalando Capacitor core + CLI + plataformas');
  let code = await spawnStreamed('npm', ['install', '--save', ...CAP_DEPS]);
  if (code !== 0) {
    fail(`npm install fallo con codigo ${code}`);
    process.exit(code);
  }

  header('Instalando plugins recomendados (POS)');
  code = await spawnStreamed('npm', ['install', '--save', ...CAP_PLUGINS]);
  if (code !== 0) {
    fail(`npm install plugins fallo con codigo ${code}`);
    fail('Si fue por permisos/red: reintenta con conexion estable');
    process.exit(code);
  }

  ok('Capacitor + plugins instalados.');
}

async function init() {
  if (!exists('node_modules/@capacitor/core')) {
    fail('Capacitor no instalado. Corre primero: node mobile-build.js install');
    process.exit(1);
  }

  header('Limpiando placeholders previos');
  if (exists('android/build.gradle') && !exists('android/app')) {
    log('Removiendo placeholder android/build.gradle...', 'gray');
    fs.rmSync('android/build.gradle', { force: true });
  }
  if (exists('ios/Podfile') && !exists('ios/App')) {
    log('Removiendo placeholder ios/Podfile...', 'gray');
    fs.rmSync('ios/Podfile', { force: true });
  }

  if (!exists('android/app')) {
    header('npx cap add android');
    const code = await spawnStreamed('npx', ['cap', 'add', 'android']);
    if (code !== 0) {
      fail('cap add android fallo. Revisa que Capacitor este instalado.');
      process.exit(code);
    }
  } else {
    ok('android/ ya inicializado, salto cap add android');
  }

  if (isMac) {
    if (!exists('ios/App')) {
      header('npx cap add ios');
      const code = await spawnStreamed('npx', ['cap', 'add', 'ios']);
      if (code !== 0) {
        fail('cap add ios fallo. Revisa cocoapods.');
        process.exit(code);
      }
    } else {
      ok('ios/ ya inicializado, salto cap add ios');
    }
  } else {
    warn('iOS solo se inicializa en macOS. Salto cap add ios.');
  }

  await sync();
}

async function sync() {
  if (!exists('node_modules/@capacitor/core')) {
    fail('Capacitor no instalado. Corre: node mobile-build.js install');
    process.exit(1);
  }
  header('cap sync');
  const code = await spawnStreamed('npx', ['cap', 'sync']);
  if (code !== 0) {
    fail(`cap sync fallo con codigo ${code}`);
    process.exit(code);
  }
  ok('cap sync OK.');
}

async function androidDebug() {
  if (printPrereqProblems(checkPrereqs(true))) process.exit(1);
  if (!exists('android/app/build.gradle')) {
    fail('android/ aun no inicializado.');
    fail('Corre: node mobile-build.js install && node mobile-build.js init');
    process.exit(1);
  }

  await sync();

  header('Compilando APK debug');
  const code = await spawnStreamed(gradleW, ['assembleDebug'], { cwd: 'android' });
  if (code !== 0) {
    fail(`gradlew assembleDebug fallo con codigo ${code}`);
    fail('Causas comunes:');
    fail('  - JAVA_HOME apunta a JDK distinto de 17');
    fail('  - SDK Platform 34/35 no instalado en Android Studio');
    fail('  - Sin permisos de escritura en android/.gradle/');
    process.exit(code);
  }
  const apk = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
  ok(`APK debug listo: ${apk}`);
  ok(`Tamano: ${fs.existsSync(apk) ? (fs.statSync(apk).size / 1024 / 1024).toFixed(2) + ' MB' : '?'}`);
}

async function androidRelease() {
  if (printPrereqProblems(checkPrereqs(true))) process.exit(1);
  if (!exists('android/app/volvix-release.keystore')) {
    fail('Keystore no encontrado en android/app/volvix-release.keystore');
    fail('Genera uno con:');
    log('  keytool -genkey -v -keystore android/app/volvix-release.keystore \\', 'gray');
    log('    -alias volvix-pos -keyalg RSA -keysize 2048 -validity 10000', 'gray');
    fail('Y agrega VOLVIX_KEYSTORE_PASSWORD/VOLVIX_KEY_ALIAS/VOLVIX_KEY_PASSWORD');
    fail('a android/gradle.properties (ver mobile-assets/SIGNING-GUIDE.md).');
    process.exit(1);
  }
  await sync();
  header('Compilando APK release (firmado)');
  const code = await spawnStreamed(gradleW, ['assembleRelease'], { cwd: 'android' });
  if (code !== 0) {
    fail(`gradlew assembleRelease fallo con codigo ${code}`);
    process.exit(code);
  }
  ok('APK release: android/app/build/outputs/apk/release/app-release.apk');
  ok('Verifica firma: apksigner verify --verbose app-release.apk');
}

async function androidBundle() {
  if (printPrereqProblems(checkPrereqs(true))) process.exit(1);
  if (!exists('android/app/volvix-release.keystore')) {
    fail('Keystore requerido para AAB. Ver mobile-assets/SIGNING-GUIDE.md');
    process.exit(1);
  }
  await sync();
  header('Compilando AAB (Google Play)');
  const code = await spawnStreamed(gradleW, ['bundleRelease'], { cwd: 'android' });
  if (code !== 0) {
    fail(`gradlew bundleRelease fallo con codigo ${code}`);
    process.exit(code);
  }
  ok('AAB: android/app/build/outputs/bundle/release/app-release.aab');
  ok('Sube ese archivo a Google Play Console > Internal testing.');
}

async function iosBuild() {
  if (!isMac) {
    fail('iOS solo se compila en macOS (necesitas Xcode).');
    fail('En Windows/Linux: solo Android es compilable. La PWA cubre iOS.');
    process.exit(1);
  }
  if (!exists('ios/App')) {
    fail('ios/ no inicializado. Corre: node mobile-build.js init');
    process.exit(1);
  }
  await sync();
  header('pod install');
  const code = await spawnStreamed('pod', ['install'], { cwd: 'ios/App' });
  if (code !== 0) {
    fail(`pod install fallo con codigo ${code}`);
    process.exit(code);
  }
  ok('Abriendo Xcode -> Product -> Archive');
  await spawnStreamed('open', ['ios/App/App.xcworkspace']);
}

async function clean() {
  header('Limpiando outputs de build');
  const targets = [
    'android/app/build',
    'android/build',
    'android/.gradle',
    'ios/App/build',
  ];
  for (const t of targets) {
    if (exists(t)) {
      try {
        fs.rmSync(t, { recursive: true, force: true });
        ok(`removido ${t}`);
      } catch (e) {
        warn(`no pude remover ${t}: ${e.message}`);
      }
    }
  }
  ok('Limpieza completa.');
}

function help() {
  log('', 'reset');
  log('Volvix POS  Mobile build pipeline (Capacitor)', 'bold');
  log('', 'reset');
  log('USO:', 'bold');
  log('  node mobile-build.js <command>', 'reset');
  log('', 'reset');
  log('COMMANDS:', 'bold');
  log('  doctor             Diagnostica entorno (Node/Java/Android SDK/Xcode)', 'reset');
  log('  install            Instala @capacitor/* core + plugins POS', 'reset');
  log('  init               cap add android (+ ios en mac) y sync inicial', 'reset');
  log('  sync               Copia capacitor.config.json + plugins -> proyectos nativos', 'reset');
  log('  android-debug      Compila APK debug (sin firma)', 'reset');
  log('  android-release    Compila APK release (requiere keystore)', 'reset');
  log('  android-bundle     Compila AAB para Google Play (requiere keystore)', 'reset');
  log('  ios                Abre Xcode (build manual desde ahi, solo macOS)', 'reset');
  log('  clean              Limpia android/build, ios/build y .gradle/', 'reset');
  log('  help               Muestra esta ayuda', 'reset');
  log('', 'reset');
  log('PRIMER BUILD (orden recomendado):', 'bold');
  log('  1) node mobile-build.js doctor', 'gray');
  log('  2) node mobile-build.js install', 'gray');
  log('  3) node mobile-build.js init', 'gray');
  log('  4) node mobile-build.js android-debug', 'gray');
  log('', 'reset');
  log('OUTPUTS:', 'bold');
  log('  APK debug    android/app/build/outputs/apk/debug/app-debug.apk', 'gray');
  log('  APK release  android/app/build/outputs/apk/release/app-release.apk', 'gray');
  log('  AAB          android/app/build/outputs/bundle/release/app-release.aab', 'gray');
  log('', 'reset');
  log('REQUISITOS Android:', 'bold');
  log('  - JDK 17 (Temurin recomendado)', 'gray');
  log('  - Android Studio + SDK Platform 34', 'gray');
  log('  - ANDROID_HOME y JAVA_HOME definidos', 'gray');
  log('', 'reset');
  log('REQUISITOS iOS (solo macOS):', 'bold');
  log('  - Xcode 15+ y Cocoapods', 'gray');
  log('  - Apple Developer Account (firma)', 'gray');
  log('', 'reset');
}

// ----------------------------- dispatch -----------------------------

const commands = {
  help,
  '--help':            help,
  '-h':                help,
  doctor,
  install,
  init,
  sync,
  // formato kebab (nuevo, recomendado)
  'android-debug':     androidDebug,
  'android-release':   androidRelease,
  'android-bundle':    androidBundle,
  // formato dos puntos (compatibilidad)
  'android:debug':     androidDebug,
  'android:release':   androidRelease,
  'android:bundle':    androidBundle,
  ios:                 iosBuild,
  clean,
};

(async () => {
  const target = (process.argv[2] || 'help').toLowerCase();
  const fn = commands[target];
  if (!fn) {
    fail(`Comando desconocido: ${target}`);
    help();
    process.exit(1);
  }
  try {
    await fn();
  } catch (e) {
    fail(`Error inesperado: ${e.message}`);
    if (e.stack) log(e.stack, 'gray');
    process.exit(1);
  }
})();
