// tests/visual-audit-report-generator.js
// Reads tests/visual-audit-results.jsonl and produces B40_VISUAL_AUDIT_REPORT.md
//
// Run:
//   node tests/visual-audit-report-generator.js
//
// Output: <project root>/B40_VISUAL_AUDIT_REPORT.md

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, 'visual-audit-results.jsonl');
const REPORT_FILE = path.join(path.dirname(__dirname), 'B40_VISUAL_AUDIT_REPORT.md');

if (!fs.existsSync(RESULTS_FILE)) {
  console.error(`No results file at ${RESULTS_FILE}. Run the visual audit first.`);
  process.exit(1);
}

const lines = fs.readFileSync(RESULTS_FILE, 'utf8').split('\n').filter(Boolean);
const results = [];
for (const line of lines) {
  try { results.push(JSON.parse(line)); }
  catch (e) { console.warn('Skipping malformed line:', e.message); }
}

// Aggregate stats
let totalScreens = results.length;
let loadedScreens = 0;
let totalButtonsAudited = 0;
let totalButtonsVisible = 0;
let deadButtons = 0;
let modalButtons = 0;
let navButtons = 0;
let toastButtons = 0;
let domChangedButtons = 0;
let clickErrorButtons = 0;
let disabledButtons = 0;
let skippedDestructive = 0;
let totalConsoleErrors = 0;
let totalPageErrors = 0;
let totalScreenshots = 0;

const deadByScreen = []; // { url, role, label }[]
const errorByScreen = []; // { url, role, label, error }[]
const consoleErrorsByScreen = []; // { url, role, errors: [] }[]

for (const r of results) {
  if (r.loaded) loadedScreens++;
  totalButtonsVisible += (r.buttons_total_visible || 0);
  totalButtonsAudited += (r.buttons_audited || 0);
  totalConsoleErrors += (r.console_errors?.length || 0);
  totalPageErrors += (r.page_errors?.length || 0);
  totalScreenshots += (r.screenshots?.length || 0);

  if ((r.console_errors?.length || 0) > 0 || (r.page_errors?.length || 0) > 0) {
    consoleErrorsByScreen.push({
      url: r.url, role: r.role,
      console_errors: r.console_errors || [],
      page_errors: r.page_errors || [],
    });
  }

  for (const b of (r.buttons || [])) {
    const obs = b.action_observed || '';
    if (obs === 'NOTHING_HAPPENED') {
      deadButtons++;
      deadByScreen.push({ url: r.url, role: r.role, label: b.label || '(no label)', idx: b.idx });
    } else if (obs.startsWith('modal')) {
      modalButtons++;
    } else if (obs.startsWith('navigation')) {
      navButtons++;
    } else if (obs === 'toast') {
      toastButtons++;
    } else if (obs === 'dom_changed') {
      domChangedButtons++;
    } else if (obs === 'CLICK_ERROR') {
      clickErrorButtons++;
      errorByScreen.push({ url: r.url, role: r.role, label: b.label || '(no label)', error: b.error });
    } else if (obs === 'DISABLED') {
      disabledButtons++;
    } else if (obs === 'SKIPPED_DESTRUCTIVE') {
      skippedDestructive++;
    }
  }
}

const auditableButtons = totalButtonsAudited - disabledButtons - skippedDestructive;
const workingButtons = modalButtons + navButtons + toastButtons + domChangedButtons;
const score = auditableButtons > 0
  ? ((workingButtons / auditableButtons) * 100).toFixed(1)
  : 'N/A';

// ────────────────────────── BUILD MD ──────────────────────────
const lines2 = [];
const push = (s) => lines2.push(s);

push('# B40 — Volvix POS Visual Audit Report');
push('');
push(`Generated: ${new Date().toISOString()}`);
push('');
push('This report is the result of a click-by-click Playwright audit of every');
push('major screen in Volvix POS. For each visible button, we click it and');
push('observe what happens (modal opens, navigation, toast, DOM mutation, or');
push('nothing). Buttons that do **NOTHING_HAPPENED** are flagged as dead.');
push('');
push('## Summary');
push('');
push('| Metric | Value |');
push('|---|---|');
push(`| Screens audited | ${totalScreens} |`);
push(`| Screens that loaded successfully | ${loadedScreens} / ${totalScreens} |`);
push(`| Buttons visible across all screens | ${totalButtonsVisible} |`);
push(`| Buttons actually audited (capped at 40/screen) | ${totalButtonsAudited} |`);
push(`| Buttons skipped (disabled) | ${disabledButtons} |`);
push(`| Buttons skipped (destructive — logout, delete-all, etc.) | ${skippedDestructive} |`);
push(`| **Buttons that opened a modal** | ${modalButtons} |`);
push(`| **Buttons that navigated** | ${navButtons} |`);
push(`| **Buttons that triggered a toast** | ${toastButtons} |`);
push(`| **Buttons that mutated the DOM** | ${domChangedButtons} |`);
push(`| **DEAD buttons (NOTHING_HAPPENED)** | **${deadButtons}** |`);
push(`| Buttons that errored on click | ${clickErrorButtons} |`);
push(`| Console errors (excl. favicon 404) | ${totalConsoleErrors} |`);
push(`| Uncaught page errors | ${totalPageErrors} |`);
push(`| Screenshots captured | ${totalScreenshots} |`);
push('');
push(`### Health score`);
push('');
push(`**${score}% of auditable buttons did something meaningful.**`);
push('');
push('Formula: `(modal + nav + toast + dom_changed) / (audited - disabled - skipped) * 100`');
push('');

// ────────────────────────── DEAD BUTTONS ──────────────────────────
push('## Dead buttons (do nothing on click)');
push('');
if (deadByScreen.length === 0) {
  push('_None — every clickable button produced an observable side-effect._');
} else {
  push('| Role | Screen | Button label | idx |');
  push('|---|---|---|---|');
  for (const d of deadByScreen) {
    const label = (d.label || '').replace(/\|/g, '\\|') || '(no label)';
    push(`| ${d.role} | \`${d.url}\` | ${label} | ${d.idx} |`);
  }
}
push('');

// ────────────────────────── CLICK ERRORS ──────────────────────────
push('## Buttons that errored on click');
push('');
if (errorByScreen.length === 0) {
  push('_None._');
} else {
  push('| Role | Screen | Button label | Error |');
  push('|---|---|---|---|');
  for (const e of errorByScreen) {
    const label = (e.label || '').replace(/\|/g, '\\|') || '(no label)';
    const err = (e.error || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    push(`| ${e.role} | \`${e.url}\` | ${label} | ${err} |`);
  }
}
push('');

// ────────────────────────── CONSOLE ERRORS ──────────────────────────
push('## Console / page errors per screen');
push('');
if (consoleErrorsByScreen.length === 0) {
  push('_No console or uncaught errors detected._');
} else {
  for (const c of consoleErrorsByScreen) {
    push(`### \`${c.url}\` (${c.role})`);
    push('');
    if (c.console_errors.length) {
      push('**Console errors:**');
      push('');
      for (const e of c.console_errors.slice(0, 20)) {
        push(`- \`${e.replace(/`/g, "'")}\``);
      }
    }
    if (c.page_errors.length) {
      push('');
      push('**Page errors (uncaught):**');
      push('');
      for (const e of c.page_errors.slice(0, 20)) {
        push(`- \`${e.replace(/`/g, "'")}\``);
      }
    }
    push('');
  }
}
push('');

// ────────────────────────── PER-SCREEN BREAKDOWN ──────────────────────────
push('## Per-screen breakdown');
push('');
for (const r of results) {
  const dead = (r.buttons || []).filter(b => b.action_observed === 'NOTHING_HAPPENED').length;
  const total = (r.buttons || []).length;
  push(`### ${r.role} → \`${r.url}\``);
  push('');
  push(`- Loaded: ${r.loaded ? 'yes' : `**no** (${r.load_error || 'unknown'})`}`);
  if (r.final_url && r.final_url !== r.url) push(`- Final URL: \`${r.final_url}\``);
  push(`- Buttons visible: ${r.buttons_total_visible ?? 0}`);
  push(`- Buttons audited: ${total}`);
  push(`- Dead buttons: ${dead}`);
  push(`- Console errors: ${r.console_errors?.length || 0}`);
  push(`- Page errors: ${r.page_errors?.length || 0}`);
  if (r.screenshots?.length) {
    push(`- Screenshots:`);
    for (const s of r.screenshots) {
      push(`  - \`${s}\``);
    }
  }
  if (total > 0) {
    push('');
    push('| idx | Label | Type | Observed |');
    push('|---|---|---|---|');
    for (const b of r.buttons) {
      const flag = b.action_observed === 'NOTHING_HAPPENED' ? ' DEAD' : '';
      const lbl = (b.label || '').replace(/\|/g, '\\|') || '_(no label)_';
      const obs = (b.action_observed || '').replace(/\|/g, '\\|');
      push(`| ${b.idx} | ${lbl} | ${b.type} | ${obs}${flag} |`);
    }
  }
  push('');
}

// ────────────────────────── RECOMMENDATIONS ──────────────────────────
push('## Recommendations');
push('');
if (deadButtons === 0 && clickErrorButtons === 0 && totalPageErrors === 0) {
  push('- All audited buttons produced an observable effect. No action required.');
} else {
  if (deadButtons > 0) {
    push(`- ${deadButtons} button(s) appear visually but do nothing when clicked.`);
    push('  Wire up handlers (or remove the buttons) so users do not click into dead UI.');
  }
  if (clickErrorButtons > 0) {
    push(`- ${clickErrorButtons} button(s) threw an error on click — likely intercepted by`);
    push('  another element or detached from the DOM. Inspect z-index / overlay coverage.');
  }
  if (totalPageErrors > 0) {
    push(`- ${totalPageErrors} uncaught JS error(s) leaked to the page. Triage in console`);
    push('  errors section above; these may indicate broken handlers.');
  }
}
push('');
push('## How to reproduce');
push('');
push('```bash');
push('# from project root');
push('TEST_TARGET=prod npx playwright test --config=tests/playwright.visual.config.js');
push('node tests/visual-audit-report-generator.js');
push('```');
push('');
push(`Source data: \`tests/visual-audit-results.jsonl\` (${results.length} lines)`);
push('');

fs.writeFileSync(REPORT_FILE, lines2.join('\n'), 'utf8');
console.log(`Report written: ${REPORT_FILE}`);
console.log(`Screens: ${totalScreens} | Buttons audited: ${totalButtonsAudited} | Dead: ${deadButtons} | Score: ${score}%`);
