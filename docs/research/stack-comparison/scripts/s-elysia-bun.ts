import { Elysia, t } from 'elysia';
import { port } from './common.ts';
new Elysia().get('/sse',()=>new Response(new ReadableStream({start(c){const e=new TextEncoder();c.enqueue(e.encode('retry: 2000\n\n'));(c as any).t=setInterval(()=>c.enqueue(e.encode(': hb\n\n')),15000)},cancel(){}}),{headers:{'content-type':'text/event-stream','cache-control':'no-cache'}}))
 .post('/intent',({cookie,set})=>{ if(!cookie.sid?.value){set.status=401;return}; return {ok:true}},{body:t.Object({intent:t.Union([t.Literal('answer'),t.Literal('pose'),t.Literal('grab')]),puzzleId:t.String({minLength:1,maxLength:40}),answer:t.Optional(t.String({maxLength:200}))},{additionalProperties:false})})
 .listen({port,hostname:'0.0.0.0'});
