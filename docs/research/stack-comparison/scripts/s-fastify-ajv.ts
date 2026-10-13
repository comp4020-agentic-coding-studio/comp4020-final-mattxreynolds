import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { Type } from '@sinclair/typebox';
import { port } from './common.ts';
const app = Fastify();
await app.register(cookie);
app.get('/sse',(req,reply)=>{
  reply.hijack(); const res = reply.raw;
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});
  res.write('retry: 2000\n\n'); const t=setInterval(()=>res.write(': hb\n\n'),15000); req.raw.on('close',()=>clearInterval(t));
});
app.post('/intent',{schema:{body:Type.Object({intent:Type.Union([Type.Literal('answer'),Type.Literal('pose'),Type.Literal('grab')]),puzzleId:Type.String({minLength:1,maxLength:40}),answer:Type.Optional(Type.String({maxLength:200}))},{additionalProperties:false})}},async (req,reply)=>{
  if(!req.cookies.sid) return reply.code(401).send(); return {ok:true};
});
await app.listen({port,host:'0.0.0.0'});
