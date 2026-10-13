// per-Voyage promise-chain mutex + cross-process busy behaviour
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('../data/s.db'); db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS c(id TEXT PRIMARY KEY,n INT);INSERT OR REPLACE INTO c VALUES(\'v\',0)');
const chains=new Map(); const withVoyage=(id,fn)=>{const p=(chains.get(id)??Promise.resolve()).then(fn); chains.set(id,p.catch(()=>{})); return p;};
const g=db.prepare('SELECT n FROM c WHERE id=?'), u=db.prepare('UPDATE c SET n=? WHERE id=?');
const act=()=>withVoyage('v',async()=>{ await new Promise(r=>setImmediate(r)); db.exec('BEGIN IMMEDIATE'); try{const n=g.get('v').n; u.run(n+1,'v'); db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e}});
await Promise.all(Array.from({length:2000},act));
console.log('final n (expect 2000):',g.get('v').n);
// WITHOUT atomic tx and with await between read and write -> lost updates
let lost=0; db.exec("UPDATE c SET n=0"); 
await Promise.all(Array.from({length:200},async()=>{const n=g.get('v').n; await new Promise(r=>setImmediate(r)); u.run(n+1,'v');}));
console.log('naive read-await-write result (expect <200):',g.get('v').n);
