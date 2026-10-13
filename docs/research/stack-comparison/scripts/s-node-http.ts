import http from 'node:http';
import { Intent, port, parseCookie } from './common.ts';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://x');
  if (req.method==='GET' && url.pathname==='/sse') {
    res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
    res.write('retry: 2000\n\n');
    const t = setInterval(()=>res.write(': hb\n\n'), 15000);
    req.on('close', ()=>clearInterval(t));
    return;
  }
  if (req.method==='POST' && url.pathname==='/intent') {
    const sid = parseCookie(req.headers.cookie)['sid'];
    if (!sid) { res.writeHead(401).end(); return; }
    let body=''; for await (const c of req) body+=c;
    let j; try { j = JSON.parse(body) } catch { res.writeHead(400).end(); return }
    const r = Intent.safeParse(j);
    if (!r.success) { res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:'bad'})); return }
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true}));
    return;
  }
  res.writeHead(404).end();
});
server.listen(port,'0.0.0.0');
