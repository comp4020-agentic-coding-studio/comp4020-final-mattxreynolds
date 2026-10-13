import { Intent, port, parseCookie } from './common.ts';
Bun.serve({ port, hostname:'0.0.0.0', idleTimeout: 0, async fetch(req){
  const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname==='/sse'){
    let t:any; const enc=new TextEncoder();
    return new Response(new ReadableStream({start(ctrl){ctrl.enqueue(enc.encode('retry: 2000\n\n')); t=setInterval(()=>ctrl.enqueue(enc.encode(': hb\n\n')),15000)}, cancel(){clearInterval(t)}}),{headers:{'content-type':'text/event-stream','cache-control':'no-cache'}});
  }
  if(req.method==='POST'&&url.pathname==='/intent'){
    if(!parseCookie(req.headers.get('cookie')??undefined)['sid']) return new Response(null,{status:401});
    let j; try{j=await req.json()}catch{return Response.json({error:'bad'},{status:400})}
    const r=Intent.safeParse(j); if(!r.success) return Response.json({error:'bad'},{status:400}); return Response.json({ok:true});
  }
  return new Response(null,{status:404});
}});
