// Smoke test: lanza 5 giros para verificar que el pipeline funciona
const workerpool = require('workerpool');
const path = require('path');
const fs = require('fs');

const sample = [
  {rank:1, query:'restaurante', category_expected:'alimentos', marca_premium_esperada_si_existiera:'comandero', screenshotEvery:true},
  {rank:2, query:'sabanas', category_expected:'hogar', marca_premium_esperada_si_existiera:'almohada', screenshotEvery:false},
  {rank:3, query:'sexshop', category_expected:'retail', marca_premium_esperada_si_existiera:'discreto', screenshotEvery:true},
  {rank:4, query:'cabrito', category_expected:'alimentos', marca_premium_esperada_si_existiera:'asado', screenshotEvery:false},
  {rank:5, query:'vulcanizadora rara', category_expected:'auto', marca_premium_esperada_si_existiera:'refacciona', screenshotEvery:false},
];

const pool = workerpool.pool(path.join(__dirname, 'validator-worker.js'), {minWorkers:3, maxWorkers:3, workerType:'process'});

(async () => {
  const t0 = Date.now();
  const results = await Promise.all(sample.map(s => pool.exec('validateGiro', [s])));
  console.log(JSON.stringify(results.map(r=>({
    rank: r.rank, query: r.query, slug: r.slug, finalUrl: r.finalUrl,
    check2_not_plain: r.check2,
    h1: r.data?.h1?.slice(0,80),
    elapsedMs: r.elapsedMs,
    error: r.error
  })), null, 2));
  console.log(`\nTotal time: ${(Date.now()-t0)/1000}s for 5 giros in 3 workers parallel`);
  await pool.terminate();
})();
