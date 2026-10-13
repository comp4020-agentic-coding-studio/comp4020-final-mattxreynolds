Deno.serve({port:Number(Deno.env.get('PORT')),hostname:'0.0.0.0',onListen(){}},()=>new Response('hi'));
