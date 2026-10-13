import http from 'node:http';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('./site/index.html', import.meta.url));
const conns = new Set();
const s = http.createServer((req, res) => {
  if (req.url === '/events') { res.writeHead(200, {'content-type':'text/event-stream'}); res.write('data: hi\n\n'); conns.add(res); res.on('close',()=>conns.delete(res)); return; }
  res.writeHead(200, {'content-type':'text/html'}); res.end(page);
});
s.listen(Number(process.env.PORT||8080), '0.0.0.0', () => console.log('listening', process.pid));
let t0=Date.now();
process.on('SIGTERM', () => { console.log('SIGTERM pid', process.pid, 'conns', conns.size); for (const c of conns) c.end(); s.close(()=>process.exit(0)); });
