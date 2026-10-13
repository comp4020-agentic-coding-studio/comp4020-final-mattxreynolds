import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
const [,, name, ...cmd] = process.argv;
const PORT = 3200 + Math.floor(Math.random()*500);
const quota = process.env.QUOTA ?? '25%';
const t0 = performance.now();
const child = spawn('systemd-run', ['--user','--scope','--quiet',`-p`,`CPUQuota=${quota}`,'-p','MemoryMax=256M','-p','MemorySwapMax=0','-E',`PORT=${PORT}`,...cmd], {stdio:['ignore','inherit','inherit'], cwd: process.env.SCRIPTS});
const rss = () => { try { const s=fs.readFileSync(`/proc/${child.pid}/status`,'utf8'); return +(s.match(/VmRSS:\s+(\d+)/)[1])/1024 } catch { return NaN } };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const agent = new http.Agent({keepAlive:true, maxSockets:16});
function post(body, cookie='sid=abc'){ return new Promise((res,rej)=>{ const r=http.request({host:'127.0.0.1',port:PORT,path:'/intent',method:'POST',agent,headers:{'content-type':'application/json','cookie':cookie}},resp=>{resp.resume();resp.on('end',()=>res(resp.statusCode))}); r.on('error',rej); r.end(body)})}
// cold start: poll /nothing until any HTTP response
let up=false, cold;
while(!up){ try{ await new Promise((res,rej)=>{const r=http.get({host:'127.0.0.1',port:PORT,path:'/x',agent:false},x=>{x.resume();res()});r.on('error',rej)}); up=true; cold=performance.now()-t0 }catch{ await sleep(5) } if(performance.now()-t0>20000) throw new Error('no start') }
const cmdline = fs.readFileSync(`/proc/${child.pid}/cmdline`,'utf8').split('\0')[0];
await sleep(1500);
const rssIdle = rss();
// POST throughput
const good = JSON.stringify({intent:'answer',puzzleId:'p1',answer:'hello'});
const bad = JSON.stringify({intent:'zzz'});
for(let i=0;i<200;i++) await post(good); // warmup
let n=0, stop=performance.now()+6000, codes={};
await Promise.all(Array.from({length:16},async()=>{ while(performance.now()<stop){ const c=await post(n%10==0?bad:good); codes[c]=(codes[c]||0)+1; n++ } }));
const rps = n/6;
const rssAfterLoad = rss();
// 500 SSE
let open=0; const socks=[];
const tS=performance.now();
for(let i=0;i<500;i++){ await new Promise(res=>{ const s=net.connect(PORT,'127.0.0.1',()=>{ s.write('GET /sse HTTP/1.1\r\nHost: x\r\nAccept: text/event-stream\r\n\r\n') }); s.on('data',d=>{ if(!s._got){s._got=1;open++;res()} }); s.on('error',()=>res()); socks.push(s); setTimeout(res,3000) }) }
await sleep(2000);
const rss500 = rss();
// CPU-throttled latency of one POST with 500 open
const tl=performance.now(); await post(good); const lat=performance.now()-tl;
// close 250 and check server notices/frees
socks.forEach(s=>s.destroy()); await sleep(2000);
const rssClosed = rss();
console.log(JSON.stringify({name, bin:cmdline.split('/').pop(), quota, coldMs:Math.round(cold), rssIdleMB:+rssIdle.toFixed(1), rps:Math.round(rps), codes, rssAfterLoadMB:+rssAfterLoad.toFixed(1), sseOpen:open, rss500SSE_MB:+rss500.toFixed(1), postLatWith500Ms:+lat.toFixed(1), rssAfterCloseMB:+rssClosed.toFixed(1)}));
child.kill('SIGTERM'); await sleep(300); process.exit(0);
