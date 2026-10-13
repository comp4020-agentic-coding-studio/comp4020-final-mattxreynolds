import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.argv[2]);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
db.exec('CREATE TABLE IF NOT EXISTS voyage(id TEXT PRIMARY KEY, seq INT); CREATE TABLE IF NOT EXISTS event(id INTEGER PRIMARY KEY, seq INT); INSERT OR IGNORE INTO voyage VALUES(\'v\',0)');
const sel=db.prepare('SELECT seq FROM voyage WHERE id=\'v\''), upd=db.prepare('UPDATE voyage SET seq=? WHERE id=\'v\''), ins=db.prepare('INSERT INTO event(seq) VALUES(?)');
let acked=0;
for(let i=1;;i++){
  db.exec('BEGIN IMMEDIATE');
  const s=sel.get().seq+1; upd.run(s);
  if(i%7===0){ // leave tx open with half-written state, busy loop so kill lands mid-tx
    ins.run(s); console.log('MID '+s); const t=Date.now(); while(Date.now()-t<30){} }
  ins.run(s);
  db.exec('COMMIT'); acked=s;
  console.log('ACK '+s);
}
