import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { getCookie } from 'hono/cookie';
import { Intent, port } from './common.ts';
const app = new Hono();
app.get('/sse',(c)=>streamSSE(c, async (s)=>{
  await s.write('retry: 2000\n\n'); 
  let closed=false; s.onAbort(()=>{closed=true});
  while(!closed){ await s.sleep(15000); if(!closed) await s.write(': hb\n\n'); }
}));
app.post('/intent', async (c)=>{
  if(!getCookie(c,'sid')) return c.body(null,401);
  let j; try{ j=await c.req.json() }catch{ return c.json({error:'bad'},400) }
  const r=Intent.safeParse(j); if(!r.success) return c.json({error:'bad'},400); return c.json({ok:true});
});
serve({fetch:app.fetch,port,hostname:'0.0.0.0'});
