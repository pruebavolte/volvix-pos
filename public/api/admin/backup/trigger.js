// /api/admin/backup/trigger
// Endpoint admin-only: retorna timestamp del último backup publicado en GitHub Releases.
// Vercel/Node serverless handler.

const GH_OWNER = process.env.GH_OWNER || 'GrupoVolvix';
const GH_REPO  = process.env.GH_REPO  || 'volvix-pos';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function isAdmin(req) {
  // 1. Header Bearer admin token
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (ADMIN_TOKEN && auth && auth === ADMIN_TOKEN) return true;

  // 2. Header x-user-role (set by upstream middleware)
  const role = (req.headers['x-user-role'] || '').toLowerCase();
  if (role === 'admin' || role === 'owner' || role === 'superadmin') return true;

  return false;
}

async function fetchLatestBackup() {
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases?per_page=50`;
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'volvix-pos-backup' };
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const releases = await res.json();
  const backups = releases
    .filter(r => (r.name || '').startsWith('Backup ') || (r.tag_name || '').startsWith('backup-'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!backups.length) return null;
  const r = backups[0];
  const dump = (r.assets || []).find(a => a.name.endsWith('.sql.gz'));
  return {
    tag: r.tag_name,
    name: r.name,
    timestamp: r.created_at,
    url: r.html_url,
    asset: dump ? { name: dump.name, size: dump.size, download_url: dump.browser_download_url } : null,
    total_backups: backups.length,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
  }

  if (!isAdmin(req)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: 'admin only' }));
  }

  try {
    const latest = await fetchLatestBackup();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      ok: true,
      latest_backup: latest,
      checked_at: new Date().toISOString(),
      note: 'Los backups corren via GitHub Action diaria 03:00 UTC. Usa workflow_dispatch para disparo manual.',
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
  }
};
