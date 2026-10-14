import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// Run once at image build: writes .br and .gz beside each compressible file in
// dist/, so the server never compresses on a request (ADR 0007).
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".map"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

for (const file of walk(process.argv[2] ?? "dist")) {
  if (!COMPRESSIBLE.has(extname(file))) continue;
  const data = readFileSync(file);
  writeFileSync(file + ".br", brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  writeFileSync(file + ".gz", gzipSync(data, { level: 9 }));
}
