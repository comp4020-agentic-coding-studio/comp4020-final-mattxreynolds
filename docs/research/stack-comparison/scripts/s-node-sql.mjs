import http from 'node:http'; import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/tmp/x-test.db'); db.exec('pragma journal_mode=wal; create table if not exists t(a)');
http.createServer((q,r)=>{db.prepare('insert into t values (?)').run('x');r.end('hi')}).listen(Number(process.env.PORT),'0.0.0.0');
