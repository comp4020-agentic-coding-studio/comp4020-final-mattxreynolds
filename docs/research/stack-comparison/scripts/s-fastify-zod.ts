import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { Intent, port } from './common.ts';
const app = Fastify();
await app.register(cookie);
app.get('/sse',(req,reply)=>{
  reply.hijack(); const res = reply.raw;
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});
  res.write('retry: 2000\n\n'); const t=setInterval(()=>res.write(': hb\n\n'),15000); req.raw.on('close',()=>clearInterval(t));
});
app.post('/intent',async (req,reply)=>{
  if(!req.cookies.sid) return reply.code(401).send();
  const r=Intent.safeParse(req.body); if(!r.success) return reply.code(400).send({error:'bad'}); return {ok:true};
});
await app.listen({port,host:'0.0.0.0'});
