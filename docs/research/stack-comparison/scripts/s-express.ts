import express from 'express';
import { Intent, port, parseCookie } from './common.ts';
const app = express();
app.get('/sse',(req,res)=>{
  res.set({'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'}); res.flushHeaders();
  res.write('retry: 2000\n\n'); const t=setInterval(()=>res.write(': hb\n\n'),15000); req.on('close',()=>clearInterval(t));
});
app.post('/intent', express.json(), (req,res)=>{
  if(!parseCookie(req.headers.cookie)['sid']) return res.status(401).end();
  const r = Intent.safeParse(req.body); if(!r.success) return res.status(400).json({error:'bad'});
  res.json({ok:true});
});
app.listen(port,'0.0.0.0');
