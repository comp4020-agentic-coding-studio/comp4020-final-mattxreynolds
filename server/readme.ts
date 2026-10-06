import { readFileSync } from "node:fs";
import { marked } from "marked";

// README.md rendered server-side, so the headings are in the HTML the server
// sends (spec/invariants.test.ts reads it with no script running).
export function renderReadme(file: string): string {
  const body = marked.parse(readFileSync(file, "utf8"), { async: false });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dead Air · README</title>
<style>
body{margin:0;background:#0b1013;color:#edf1ed;font:16px/1.7 Inter,Arial,sans-serif}
main{max-width:760px;margin:auto;padding:40px 16px 80px}
a{color:#befb70}h1,h2,h3{font-family:'Barlow Condensed',sans-serif;letter-spacing:.3px}
code{font-family:'IBM Plex Mono',monospace;background:#141c21;padding:1px 5px;border-radius:3px}
pre{background:#141c21;padding:16px;overflow:auto;border:1px solid #303a40}
img{max-width:100%}blockquote{border-left:2px solid #befb70;margin:0;padding-left:16px;color:#91a0a7}
nav{font:12px 'IBM Plex Mono',monospace;letter-spacing:1px;margin-bottom:24px}
</style></head>
<body><main><nav><a href="/">← DEAD AIR</a></nav>${body}</main></body></html>`;
}
