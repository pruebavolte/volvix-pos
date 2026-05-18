// Master: orchesta workers + MemoryMonitor + dashboard en consola
const workerpool = require('workerpool');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GIROS_FILE = path.join(__dirname, '..', 'giros-1000-manual.json');
const RAW_RESULTS_FILE = path.join(__dirname, '..', 'raw-results.jsonl');
const PROGRESS_FILE = path.join(__dirname, '..', 'progress.json');
const MEM_LOG = path.join(__dirname, '..', 'memory-decisions.log');

const TOTAL_MEM_MB = Math.floor(os.totalmem() / 1024 / 1024);
const freeMB = () => Math.floor(os.freemem() / 1024 / 1024);
const freePct = () => Math.floor((os.freemem() / os.totalmem()) * 100);

let MIN_AGENTS = 2;
let MAX_AGENTS = 8;
let currentTargetAgents = Math.max(4, Math.min(MAX_AGENTS, Math.floor(freeMB() / 700)));

console.log(`[master] Total RAM ${TOTAL_MEM_MB} MB, free ${freeMB()} MB (${freePct()}%) → arrancando con ${currentTargetAgents} workers`);

const pool = workerpool.pool(path.join(__dirname, 'validator-worker.js'), {
  minWorkers: currentTargetAgents,
  maxWorkers: currentTargetAgents,
  workerType: 'process'
});

// Clear raw-results.jsonl
fs.writeFileSync(RAW_RESULTS_FILE, '');

// Load giros
const data = JSON.parse(fs.readFileSync(GIROS_FILE, 'utf8'));
const giros = data.giros;
console.log(`[master] Total giros a procesar: ${giros.length}`);

// Counters
let completed = 0, errors = 0, planos = 0, http_ok = 0;
const startTime = Date.now();
let lastDashboardUpdate = 0;

// Memory monitor
function memTick() {
  const fp = freePct();
  const fm = freeMB();
  let msg = '';
  if (fp < 15 && currentTargetAgents > MIN_AGENTS) {
    currentTargetAgents--;
    msg = `[mem ${new Date().toISOString()}] RAM CRITICA ${fp}%, matando 1 worker. Now: ${currentTargetAgents}`;
  } else if (fp > 50 && currentTargetAgents < MAX_AGENTS - 1) {
    currentTargetAgents = Math.min(MAX_AGENTS, currentTargetAgents + 2);
    msg = `[mem ${new Date().toISOString()}] RAM ABUNDANTE ${fp}%, lanzando 2 workers. Now: ${currentTargetAgents}`;
  } else if (fp > 30 && currentTargetAgents < MAX_AGENTS) {
    currentTargetAgents++;
    msg = `[mem ${new Date().toISOString()}] RAM ok ${fp}%, +1 worker. Now: ${currentTargetAgents}`;
  }
  if (msg) {
    fs.appendFileSync(MEM_LOG, msg + '\n');
    // workerpool doesn't expose dynamic resize easily; the limit takes effect via maxQueueSize
    // For simplicity, we adjust by NOT submitting more than currentTargetAgents simultaneous tasks
  }
}
setInterval(memTick, 15000);

function updateDashboard(force=false) {
  const now = Date.now();
  if (!force && now - lastDashboardUpdate < 30000) return;
  lastDashboardUpdate = now;
  const elapsedMin = (now - startTime) / 60000;
  const speed = completed / Math.max(elapsedMin, 0.01);
  const remaining = giros.length - completed;
  const etaMin = remaining / Math.max(speed, 0.01);
  const pctDone = Math.floor((completed / giros.length) * 100);
  const bars = Math.floor(pctDone / 5);
  const bar = '█'.repeat(bars) + '░'.repeat(20 - bars);
  const fp = freePct();
  const fm = freeMB();

  const dashboard = {
    total: giros.length,
    completed,
    pct: Math.round(pctDone*10)/10,
    agents_target: currentTargetAgents,
    ram_used_pct: 100 - fp,
    ram_free_pct: fp,
    ram_free_mb: fm,
    http_ok,
    template_planos: planos,
    errors,
    speed_per_min: Math.round(speed*10)/10,
    eta_min: Math.round(etaMin),
    elapsed_min: Math.round(elapsedMin*10)/10,
    status: completed === giros.length ? 'DONE' : 'RUNNING',
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(dashboard, null, 2));

  console.log(`\n[${bar}] ${pctDone}% · ${completed}/${giros.length}`);
  console.log(`  Workers: ${currentTargetAgents}/${MAX_AGENTS} · RAM ${fp}% free (${fm}MB)`);
  console.log(`  OK: ${http_ok} · Planos: ${planos} · Errors: ${errors}`);
  console.log(`  Speed: ${speed.toFixed(1)} giros/min · ETA ${Math.round(etaMin)}min · Elapsed ${Math.round(elapsedMin)}min`);
}
setInterval(()=>updateDashboard(), 30000);

// Submit all tasks with concurrency control
async function runAll() {
  const queue = [...giros];
  const inflight = new Set();

  while (queue.length > 0 || inflight.size > 0) {
    while (inflight.size < currentTargetAgents && queue.length > 0) {
      const giro = queue.shift();
      const screenshotEvery = giro.rank % 10 === 0; // 1 of every 10 saves screenshot to avoid disk burst
      const taskInput = {
        rank: giro.rank,
        query: giro.query,
        category_expected: giro.category_expected,
        marca_premium_esperada_si_existiera: giro.marca_premium_esperada_si_existiera,
        screenshotEvery
      };
      const p = pool.exec('validateGiro', [taskInput])
        .then(result => {
          fs.appendFileSync(RAW_RESULTS_FILE, JSON.stringify(result) + '\n');
          completed++;
          if (result.error) errors++;
          else {
            if (result.check1) http_ok++;
            if (!result.check2) planos++;
          }
          if (completed % 25 === 0) updateDashboard(true);
        })
        .catch(err => {
          fs.appendFileSync(RAW_RESULTS_FILE, JSON.stringify({rank: giro.rank, query: giro.query, error: err.message}) + '\n');
          completed++; errors++;
        })
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
    if (inflight.size > 0) await Promise.race(inflight);
  }
  updateDashboard(true);
  await pool.terminate();
  console.log('\n[master] All giros processed. Raw results in:', RAW_RESULTS_FILE);
}

runAll().catch(e=>{ console.error('FATAL:', e); process.exit(1); });
