import { WebSocketServer } from 'ws'; import http from 'node:http';
const s=http.createServer((q,r)=>r.end('hi')); const w=new WebSocketServer({server:s}); s.listen(Number(process.env.PORT),'0.0.0.0');
