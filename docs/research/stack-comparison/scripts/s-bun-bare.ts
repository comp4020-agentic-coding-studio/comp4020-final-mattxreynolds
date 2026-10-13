Bun.serve({port:Number(process.env.PORT),hostname:'0.0.0.0',fetch:()=>new Response('hi')});
