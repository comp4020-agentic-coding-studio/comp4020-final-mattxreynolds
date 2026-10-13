import {spawn} from 'node:child_process'; import net from 'node:net';
const [,,...cmd]=process.argv; const P=4000+Math.floor(Math.random()*900);
const c=spawn(cmd[0],cmd.slice(1),{env:{...process.env,PORT:P},stdio:'inherit'}); const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(1500);
const socks=[]; for(let i=0;i<20;i++){const s=net.connect(P,'127.0.0.1',()=>s.write('GET /sse HTTP/1.1\r\nHost: x\r\n\r\n'));socks.push(s)} await sl(1500);
const get=()=>fetch(`http://127.0.0.1:${P}/open`).then(r=>r.text());
const a=await get(); socks.forEach(s=>s.destroy()); await sl(2500); const b=await get(); console.log(cmd[0].split('/').pop(),'open before',a,'after close',b); c.kill();
