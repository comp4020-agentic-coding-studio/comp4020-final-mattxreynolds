import { Server } from 'socket.io'; import http from 'node:http';
const s=http.createServer((q,r)=>r.end('hi')); new Server(s); s.listen(Number(process.env.PORT),'0.0.0.0');
