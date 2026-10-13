import zlib from 'zlib'; import fs from 'fs';
for (const p of process.argv.slice(2)) { const b = fs.readFileSync(p); console.log(p.split('/').slice(-3,-2)[0]||p, 'raw', b.length, 'gz', zlib.gzipSync(b,{level:9}).length, 'br', zlib.brotliCompressSync(b).length); }
