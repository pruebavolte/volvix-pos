const https = require('https');
const PAT = 'sbp_b6fe6a70e5176d0662fa19c6363ecb4775a8f72e';
const sql = `SELECT email, substring(password_hash, 1, 10) as prefix, length(password_hash) as len FROM pos_users LIMIT 20;`;
const body = JSON.stringify({ query: sql });
const opts = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/zhvwmzkcqngcaqpdxtwr/database/query',
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + PAT, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
};
const req = https.request(opts, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data));
});
req.write(body); req.end();
