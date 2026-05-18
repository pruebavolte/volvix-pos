#!/usr/bin/env node
/* ============================================================
   VOLVIX · Build de apps nativas
   ============================================================
   Empaqueta los HTMLs como:
   - APK Android
   - MSI Windows
   - DMG macOS
   - AppImage Linux

   Uso:
     node build-apps.js android
     node build-apps.js windows
     node build-apps.js mac
     node build-apps.js linux
     node build-apps.js all

   Requisitos:
     - Android: JDK 17 + Android Studio SDK
     - Windows: Rust + MSVC Build Tools
     - Mac: Xcode Command Line Tools
     - Linux: gcc + libgtk-3-dev
============================================================ */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'help';

const targets = {
  android: {
    name: 'Android APK',
    check: () => cmd('npx cap --version'),
    setup: async () => {
      if (!fs.existsSync('node_modules/@capacitor/core')) {
        console.log('Instalando Capacitor...');
        run('npm install @capacitor/core @capacitor/cli @capacitor/android');
      }
      if (!fs.existsSync('android')) {
        console.log('Inicializando Android...');
        run('npx cap init Volvix mx.volvix.app --web-dir=public');
        run('npx cap add android');
      }
    },
    build: () => {
      run('npx cap sync android');
      run('cd android && ./gradlew assembleRelease');
      console.log('\n✓ APK generado: android/app/build/outputs/apk/release/app-release.apk');
    },
  },

  windows: {
    name: 'Windows MSI',
    check: () => cmd('cargo --version'),
    setup: async () => {
      if (!fs.existsSync('src-tauri')) {
        console.log('Inicializando Tauri...');
        run('npm install --save-dev @tauri-apps/cli');
        run('npx tauri init --ci --app-name Volvix --window-title Volvix --frontend-dist ../public --dev-url http://localhost:3000');
      }
    },
    build: () => {
      run('npx tauri build --target x86_64-pc-windows-msvc');
      console.log('\n✓ MSI generado: src-tauri/target/release/bundle/msi/');
    },
  },

  mac: {
    name: 'macOS DMG',
    check: () => cmd('cargo --version'),
    setup: async () => {
      if (!fs.existsSync('src-tauri')) {
        run('npm install --save-dev @tauri-apps/cli');
        run('npx tauri init --ci --app-name Volvix');
      }
    },
    build: () => {
      run('npx tauri build --target universal-apple-darwin');
      console.log('\n✓ DMG generado: src-tauri/target/release/bundle/dmg/');
    },
  },

  linux: {
    name: 'Linux AppImage + deb',
    check: () => cmd('cargo --version'),
    setup: async () => {
      if (!fs.existsSync('src-tauri')) {
        run('npm install --save-dev @tauri-apps/cli');
        run('npx tauri init --ci --app-name Volvix');
      }
    },
    build: () => {
      run('npx tauri build');
      console.log('\n✓ AppImage/deb generados: src-tauri/target/release/bundle/');
    },
  },
};

function cmd(c) {
  try { execSync(c, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function run(c) {
  console.log('\x1b[90m$ ' + c + '\x1b[0m');
  execSync(c, { stdio: 'inherit' });
}

async function build(key) {
  const t = targets[key];
  if (!t) { console.error('Target desconocido:', key); process.exit(1); }
  console.log(`\n=== Building ${t.name} ===\n`);
  if (t.check && !t.check()) {
    console.log('\x1b[33m⚠  Herramientas faltantes para', t.name, '\x1b[0m');
    console.log('   Instala requisitos primero (ver README)');
    return;
  }
  await t.setup();
  t.build();
}

if (target === 'help' || target === '--help') {
  console.log(`
Volvix · Build de apps nativas

USO:
  node build-apps.js <target>

TARGETS:
  android   — Genera APK Android
  windows   — Genera MSI/NSIS Windows
  mac       — Genera DMG macOS
  linux     — Genera AppImage + .deb
  all       — Genera TODAS (si tienes toolchains)

EJEMPLOS:
  node build-apps.js android
  node build-apps.js all
`);
  process.exit(0);
}

if (target === 'all') {
  (async () => {
    for (const key of Object.keys(targets)) await build(key);
  })();
} else {
  build(target);
}
