import { Hono } from 'hono'; import { serve } from '@hono/node-server'; import { streamSSE } from 'hono/streaming';
let open=0; const app=new Hono();
app.get('/sse',(c)=>streamSSE(c,async(s)=>{open++; let closed=false; s.onAbort(()=>{closed=true;open--}); while(!closed){await s.sleep(500); if(!closed) await s.write(': hb\n\n')}}));
app.get('/open',(c)=>c.text(String(open)));
serve({fetch:app.fetch,port:Number(process.env.PORT),hostname:'127.0.0.1'});
