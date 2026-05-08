// =========================================================================
// tutorials/lib/recorder.ts
// Wrapper Playwright para grabar tutoriales con cursor visible y narracion.
// Maneja: login en staging/local, inyeccion de overlay, ejecucion de steps,
// sincronizacion con audio (msedge-tts).
// =========================================================================

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { CURSOR_OVERLAY_SCRIPT } from './cursor-overlay';
import { narrate, audioDurationMs } from './narrator';
import type { TutorialConfig, TutorialStep, RecorderOptions } from './types';

export type StepNarration = {
  /** Path absoluto del MP3 a usar para esta accion (o null si no narra) */
  audioPath: string | null;
  /** Duracion estimada en ms (sleep tras play) */
  durationMs: number;
  /** Texto narrado (para captions) */
  text: string | null;
};

export type RecordResult = {
  /** Path absoluto del .webm grabado */
  webmPath: string;
  /** Lista ordenada de narraciones que se van reproduciendo durante la grabacion.
   *  El composer las concatena con silencios para hacer el track de audio final. */
  narrations: Array<{ atMs: number; audioPath: string; durationMs: number; text: string }>;
};

export async function record(config: TutorialConfig, opts: RecorderOptions): Promise<RecordResult> {
  fs.mkdirSync(opts.videoDir, { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context: BrowserContext = await browser.newContext({
    viewport: opts.viewport,
    recordVideo: { dir: opts.videoDir, size: opts.viewport },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  });

  // 2026-05-07: NO usamos context.addInitScript porque corre a document_start
  // cuando document.body aun no existe → falla la mitad del setup. Mejor
  // usamos ensureOverlay() que se llama tras cada navegacion / step.

  const page = await context.newPage();
  const narrations: RecordResult['narrations'] = [];
  const startedAt = Date.now();
  let runError: Error | null = null;

  try {
    // ---------- LOGIN ----------
    console.log('  [login] iniciando…');
    await loginIntoStaging(page, opts);
    console.log('  [login] OK · pagina actual: ' + page.url());

    // Asegurar overlay tras login
    await ensureOverlay(page);

    // ---------- STEPS ----------
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      console.log(`  [step ${i + 1}/${config.steps.length}] ${step.kind}` +
        ('selector' in step ? ` "${(step as any).selector}"` : '') +
        ('url' in step ? ` "${(step as any).url}"` : ''));
      await ensureOverlay(page);
      await runStep(page, step, narrations, startedAt);
    }

    // Pequeño cushion al final para que el video no corte abrupto
    await page.waitForTimeout(900);
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
    console.error('  [error] ' + runError.message);
  }

  const video = page.video();
  await context.close();
  await browser.close();
  const webmPath = video ? await video.path() : '';
  if (runError) throw runError;
  if (!webmPath || !fs.existsSync(webmPath)) {
    throw new Error('recorder: no se grabo el video webm');
  }
  return { webmPath, narrations };
}

/** Inyecta overlay como funcion serializada por Playwright. */
async function ensureOverlay(page: Page): Promise<void> {
  const has = await page.evaluate(() =>
    typeof (window as any).__vlxShowScreen === 'function' &&
    typeof (window as any).__vlxClickPulse === 'function'
  ).catch(() => false);
  if (has) return;
  // Playwright permite pasar funciones que se serializan automaticamente.
  try {
    const injectResult = await page.evaluate(() => {
      try {
      const w: any = window;
      // Verificar si las funciones REALMENTE existen (no solo el flag)
      if (typeof w.__vlxShowScreen === 'function' && typeof w.__vlxClickPulse === 'function') {
        return 'already-loaded';
      }
      w.__volvixTutOverlay = true;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes vlxClickPulse { 0%{width:30px;height:30px;opacity:.85} 100%{width:200px;height:200px;opacity:0} }
        @keyframes vlxRingFade { 0%,70%{opacity:1} 100%{opacity:0} }
        @keyframes vlxScreenFade { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
        .__vlx-cursor { position:fixed;z-index:2147483647;pointer-events:none;width:28px;height:28px;transform:translate(-3px,-3px);filter:drop-shadow(0 0 12px rgba(220,38,38,.85)) drop-shadow(0 2px 4px rgba(0,0,0,.4));transition:top .08s linear,left .08s linear; }
        .__vlx-pulse { position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;background:radial-gradient(circle,rgba(220,38,38,.55) 0%,rgba(220,38,38,0) 70%);transform:translate(-50%,-50%);animation:vlxClickPulse 500ms cubic-bezier(.2,.7,.3,1) forwards; }
        .__vlx-ring { position:fixed;z-index:2147483645;pointer-events:none;border:3px dashed #dc2626;border-radius:8px;box-shadow:0 0 0 3px rgba(220,38,38,.18),0 0 24px rgba(220,38,38,.35);animation:vlxRingFade 1.2s ease-out forwards; }
        .__vlx-screen { position:fixed;inset:0;z-index:2147483640;background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#312e81 100%);color:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;text-align:center;font-family:system-ui,sans-serif;animation:vlxScreenFade .5s ease-in; }
        .__vlx-screen h1 { font-size:42px;font-weight:900;letter-spacing:-1px;margin:0; }
        .__vlx-screen p { font-size:20px;opacity:.85;margin:0;max-width:80%;line-height:1.4; }
        .__vlx-caption { position:fixed;left:50%;bottom:56px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:14px 22px;border-radius:12px;font-family:system-ui,sans-serif;font-size:18px;font-weight:600;max-width:80%;text-align:center;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.5);z-index:2147483641;pointer-events:none;backdrop-filter:blur(8px); }
      `;
      document.head.appendChild(style);

      const cursor = document.createElement('div');
      cursor.className = '__vlx-cursor';
      cursor.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="28" height="28"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z" fill="#dc2626" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      cursor.style.top = '50%'; cursor.style.left = '50%';
      document.body.appendChild(cursor);

      w.__vlxMoveCursor = (x: number, y: number) => { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; };
      w.__vlxClickPulse = (x: number, y: number) => {
        const el = document.createElement('div'); el.className = '__vlx-pulse';
        el.style.left = x + 'px'; el.style.top = y + 'px';
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 600);
      };
      w.__vlxRingAt = (x: number, y: number, ww: number, hh: number) => {
        const el = document.createElement('div'); el.className = '__vlx-ring';
        el.style.left = (x - 6) + 'px'; el.style.top = (y - 6) + 'px';
        el.style.width = (ww + 12) + 'px'; el.style.height = (hh + 12) + 'px';
        document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 1300);
      };
      w.__vlxZoomEl = (selector: string, enable: boolean) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return;
        if (enable) {
          el.style.transition = 'transform 1s cubic-bezier(.4,0,.2,1)';
          el.style.transform = 'scale(1.15)';
        } else {
          el.style.transition = 'transform .6s cubic-bezier(.4,0,.2,1)';
          el.style.transform = 'scale(1)';
          setTimeout(() => { try { el.style.transition = ''; el.style.transform = ''; } catch (_) {} }, 700);
        }
      };
      w.__vlxShowScreen = (title: string, subtitle: string) => {
        const el = document.createElement('div');
        el.className = '__vlx-screen'; el.id = '__vlx-screen-active';
        el.innerHTML = '<h1>' + title + '</h1>' + (subtitle ? '<p>' + subtitle + '</p>' : '');
        document.body.appendChild(el);
      };
      w.__vlxHideScreen = () => {
        const el = document.getElementById('__vlx-screen-active'); if (el) el.remove();
      };
      w.__vlxShowCaption = (text: string) => {
        let el = document.getElementById('__vlx-caption-active');
        if (!el) { el = document.createElement('div'); el.className = '__vlx-caption'; el.id = '__vlx-caption-active'; document.body.appendChild(el); }
        el.textContent = text;
      };
      w.__vlxHideCaption = () => {
        const el = document.getElementById('__vlx-caption-active'); if (el) el.remove();
      };
      return 'injected-ok';
      } catch (e: any) {
        return 'INNER-ERR: ' + (e && e.message ? e.message : String(e));
      }
    });
    if (injectResult !== 'injected-ok' && injectResult !== 'already-loaded') {
      console.warn('  [overlay] inject result: ' + injectResult);
    }
  } catch (err: any) {
    console.warn('  [overlay] inject error: ' + (err?.message || err));
  }
  const ok = await page.evaluate(() => typeof (window as any).__vlxShowScreen === 'function').catch(() => false);
  if (!ok) console.warn('  [overlay] WARN: __vlxShowScreen sigue undefined');
}

async function loginIntoStaging(page: Page, opts: RecorderOptions): Promise<void> {
  // Estrategia: hacemos POST directo al API para obtener JWT, luego inyectamos
  // el token en localStorage y navegamos al POS. Mas confiable que driving el
  // form via UI (que puede tener race conditions con SPA framework).
  console.log('  [login] POST /api/login…');
  const apiResp = await page.request.post(opts.baseUrl + '/api/login', {
    data: { email: opts.email, password: opts.password },
    headers: { 'Content-Type': 'application/json' },
  });
  const status = apiResp.status();
  if (status !== 200) {
    const body = await apiResp.text().catch(() => '');
    throw new Error(`recorder: /api/login → ${status} · ${body.slice(0, 200)}`);
  }
  const json: any = await apiResp.json();
  const token = json.token || json?.session?.token;
  if (!token) {
    throw new Error('recorder: respuesta de /api/login no incluye token');
  }
  console.log('  [login] token obtenido · injectando en localStorage…');

  // Cargar pagina vacia primero (necesario para tener acceso a localStorage)
  await page.goto(opts.baseUrl + '/login.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(({ token, session }) => {
    localStorage.setItem('volvix_token', token);
    localStorage.setItem('volvixAuthToken', token);
    if (session) localStorage.setItem('volvixSession', JSON.stringify(session));
  }, { token, session: json.session || null });

  // Ahora navegar al POS con el token ya seteado
  await page.goto(opts.baseUrl + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function runStep(
  page: Page,
  step: TutorialStep,
  narrations: RecordResult['narrations'],
  startedAt: number
): Promise<void> {
  switch (step.kind) {
    case 'navigate': {
      const target = safeJoin(page.url(), step.url);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
      if (step.narrate) await playNarration(page, step.narrate, narrations, startedAt);
      return;
    }

    case 'click': {
      const sel = step.selector;
      await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {
        throw new Error(
          `recorder: selector NO encontrado en click → ${sel}\n` +
          `URL actual: ${page.url()}\n` +
          `(Si el modulo aun no existe en staging, repórtalo. NO inventamos selectores.)`
        );
      });
      const handle = await page.$(sel);
      if (!handle) throw new Error('recorder: selector resolved a null: ' + sel);
      const box = await handle.boundingBox();
      if (box) {
        // Mover cursor visible al centro
        await page.evaluate(([x, y]: [number, number]) => { const f=(window as any).__vlxMoveCursor; if(typeof f==='function') f(x, y); },
          [box.x + box.width / 2, box.y + box.height / 2]);
        await page.waitForTimeout(350);
        // Caja roja punteada alrededor del elemento
        await page.evaluate(([x, y, w, h]: [number, number, number, number]) => { const f=(window as any).__vlxRingAt; if(typeof f==='function') f(x, y, w, h); },
          [box.x, box.y, box.width, box.height]);
      }
      // Narrar antes del click (para que la voz acompañe la accion)
      if (step.narrate) await playNarration(page, step.narrate, narrations, startedAt);
      // Zoom opcional
      if (step.zoom) {
        await page.evaluate((s: string) => { const f=(window as any).__vlxZoomEl; if(typeof f==='function') f(s, true); }, sel);
        await page.waitForTimeout(900);
      }
      // Click + pulso visual
      if (box) {
        await page.evaluate(([x, y]: [number, number]) => { const f=(window as any).__vlxClickPulse; if(typeof f==='function') f(x, y); },
          [box.x + box.width / 2, box.y + box.height / 2]);
      }
      await handle.click({ force: true });
      if (step.zoom) {
        await page.waitForTimeout(900);
        await page.evaluate((s: string) => { const f=(window as any).__vlxZoomEl; if(typeof f==='function') f(s, false); }, sel);
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(step.postWaitMs ?? 800);
      return;
    }

    case 'type': {
      const sel = step.selector;
      await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {
        throw new Error(`recorder: selector NO encontrado en type → ${sel}`);
      });
      const handle = await page.$(sel);
      if (!handle) throw new Error('recorder: selector type → null: ' + sel);
      const box = await handle.boundingBox();
      if (box) {
        await page.evaluate(([x, y]: [number, number]) => { const f=(window as any).__vlxMoveCursor; if(typeof f==='function') f(x, y); },
          [box.x + box.width / 2, box.y + box.height / 2]);
        await page.evaluate(([x, y, w, h]: [number, number, number, number]) => { const f=(window as any).__vlxRingAt; if(typeof f==='function') f(x, y, w, h); },
          [box.x, box.y, box.width, box.height]);
      }
      await handle.click();
      await handle.fill('');
      if (step.narrate) await playNarration(page, step.narrate, narrations, startedAt);
      const delay = step.humanDelay ?? 80;
      await handle.type(step.text, { delay });
      await page.waitForTimeout(500);
      return;
    }

    case 'wait': {
      await page.waitForTimeout(step.ms);
      return;
    }

    case 'highlight': {
      const sel = step.selector;
      await page.waitForSelector(sel, { timeout: 6000 }).catch(() => {
        throw new Error(`recorder: selector NO encontrado en highlight → ${sel}`);
      });
      const handle = await page.$(sel);
      if (!handle) return;
      const box = await handle.boundingBox();
      if (box) {
        await page.evaluate(([x, y, w, h]: [number, number, number, number]) => { const f=(window as any).__vlxRingAt; if(typeof f==='function') f(x, y, w, h); },
          [box.x, box.y, box.width, box.height]);
      }
      if (step.narrate) await playNarration(page, step.narrate, narrations, startedAt);
      await page.waitForTimeout(step.ms);
      return;
    }

    case 'narrate': {
      await playNarration(page, step.text, narrations, startedAt);
      if (step.ms) await page.waitForTimeout(step.ms);
      return;
    }

    case 'screen': {
      await page.evaluate(([t, s]: [string, string | undefined]) => {
        const f=(window as any).__vlxShowScreen; if(typeof f==='function') f(t, s || '');
      }, [step.title, step.subtitle]);
      await page.waitForTimeout(step.ms);
      await page.evaluate(() => { const f=(window as any).__vlxHideScreen; if(typeof f==='function') f(); });
      await page.waitForTimeout(300);
      return;
    }
  }
}

async function playNarration(
  page: Page,
  text: string,
  narrations: RecordResult['narrations'],
  startedAt: number
): Promise<void> {
  const audioPath = await narrate(text);
  const durationMs = await audioDurationMs(audioPath);
  const atMs = Date.now() - startedAt;
  narrations.push({ atMs, audioPath, durationMs, text });
  // Asegurar overlay (puede haber pagina nueva sin overlay)
  await ensureOverlay(page);
  // Mostrar caption visual sincronizado
  await page.evaluate((t: string) => {
    const fn = (window as any).__vlxShowCaption;
    if (typeof fn === 'function') fn(t);
  }, text).catch(() => {});
  await page.waitForTimeout(durationMs + 200);
  await page.evaluate(() => {
    const fn = (window as any).__vlxHideCaption;
    if (typeof fn === 'function') fn();
  }).catch(() => {});
}

function safeJoin(currentUrl: string, target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  try {
    const u = new URL(currentUrl);
    if (target.startsWith('/')) return u.origin + target;
    return u.origin + '/' + target;
  } catch {
    return target;
  }
}
