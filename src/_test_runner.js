const https=require('https');
const TOKEN=process.env.TOK;
const HOST='volvix-pos.vercel.app';
const fs=require('fs');
const eps=fs.readFileSync('_endpoints.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
// Filter out trailing "/" - they're the same as without; also skip dummy paths
const filt=[...new Set(eps.map(e=>e.replace(/\/$/,'')).filter(e=>e!=='/api'&&e.length>4))].sort();
function req(method,path){
  return new Promise(resolve=>{
    const opts={host:HOST,path,method,headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},timeout:15000};
    const r=https.request(opts,res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,body:b.slice(0,250)}))});
    r.on('error',e=>resolve({status:0,body:String(e).slice(0,80)}));
    r.on('timeout',()=>{r.destroy();resolve({status:0,body:'timeout'})});
    if(method==='POST')r.write('{}');
    r.end();
  });
}
(async()=>{
  const results=[];
  for(const p of filt){
    const g=await req('GET',p);
    const post=await req('POST',p);
    results.push({path:p,get:g.status,post:post.status,gbody:g.body});
    process.stdout.write(`${p} GET=${g.status} POST=${post.status}\n`);
  }
  fs.writeFileSync('_results.json',JSON.stringify(results,null,1));
})();
