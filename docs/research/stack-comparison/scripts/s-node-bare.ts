import http from 'node:http'; http.createServer((q,r)=>r.end('hi')).listen(Number(process.env.PORT),'0.0.0.0');
