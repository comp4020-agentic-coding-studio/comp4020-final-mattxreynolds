import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
const require = createRequire(process.argv[3] + '/');
const engine = process.argv[2];
const path = process.argv[4];
const sync = process.argv[5] || 'FULL';
for (const s of ['','-wal','-shm']) rmSync(path+s,{force:true});
const rss = () => Math.round(process.memoryUsage().rss/1048576);
const r0 = rss();
let db;
const t0 = performance.now();
if (engine==='node') { const {DatabaseSync}=await import('node:sqlite'); db=new DatabaseSync(path); }
else { const D=require('better-sqlite3'); db=new D(path); }
const run = (sql)=>db.exec(sql);
run(`PRAGMA journal_mode=WAL; PRAGMA synchronous=${sync}; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`);
const migs = [
 `CREATE TABLE person(id TEXT PRIMARY KEY, kind TEXT NOT NULL, pw TEXT) STRICT;`,
 `CREATE TABLE voyage(id TEXT PRIMARY KEY, draw_version INT NOT NULL, draw TEXT NOT NULL CHECK(json_valid(draw)), seq INT NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT '{}') STRICT;`,
 `CREATE TABLE event(id INTEGER PRIMARY KEY, voyage_id TEXT NOT NULL REFERENCES voyage(id), actor TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, at INT NOT NULL) STRICT; CREATE INDEX event_voyage ON event(voyage_id,id); CREATE INDEX event_actor ON event(actor,id);`,
 `CREATE TABLE pose(voyage_id TEXT, player TEXT, x REAL, y REAL, PRIMARY KEY(voyage_id,player)) STRICT;`,
];
run('CREATE TABLE IF NOT EXISTS _mig(id INTEGER PRIMARY KEY)');
db.exec('BEGIN IMMEDIATE'); migs.forEach((m,i)=>{run(m);db.prepare('INSERT INTO _mig VALUES(?)').run(i)}); db.exec('COMMIT');
const tOpen = performance.now()-t0;
const draw = JSON.stringify({v:1, rooms: Array.from({length:40},(_,i)=>({id:i,code:'x'.repeat(20)}))});
const N=10000;
db.prepare('INSERT INTO voyage(id,draw_version,draw) VALUES(?,?,?)').run('v1',1,draw);
const sel = db.prepare('SELECT seq,state FROM voyage WHERE id=?');
const upd = db.prepare('UPDATE voyage SET seq=seq+1,state=? WHERE id=?');
const ins = db.prepare('INSERT INTO event(voyage_id,actor,kind,payload,at) VALUES(?,?,?,?,?)');
const pose = db.prepare('INSERT INTO pose VALUES(?,?,?,?) ON CONFLICT(voyage_id,player) DO UPDATE SET x=excluded.x,y=excluded.y');
const t1 = performance.now();
const lat=[];
for (let i=0;i<N;i++){
  const a=performance.now();
  db.exec('BEGIN IMMEDIATE');
  const row = sel.get('v1');
  const st = JSON.parse(row.state); st['k'+(i%50)] = i;
  upd.run(JSON.stringify(st),'v1');
  ins.run('v1','p'+(i%2),'act',JSON.stringify({i}),Date.now());
  pose.run('v1','p'+(i%2),i,i);
  db.exec('COMMIT');
  lat.push(performance.now()-a);
}
const tTx = performance.now()-t1;
lat.sort((a,b)=>a-b);
const t2=performance.now();
db.prepare('SELECT count(*) c FROM event WHERE voyage_id=? AND actor=?').get('v1','p0');
const q = db.prepare('SELECT * FROM event WHERE voyage_id=? ORDER BY id DESC LIMIT 100').all('v1').length;
const tQ=performance.now()-t2;
console.log(JSON.stringify({engine, sync, openMigrate_ms:+tOpen.toFixed(1), tx_per_s:Math.round(N/tTx*1000), p50_ms:+lat[N>>1].toFixed(3), p99_ms:+lat[Math.floor(N*.99)].toFixed(3), query_ms:+tQ.toFixed(2), rss_before_MB:r0, rss_after_MB:rss()}));
