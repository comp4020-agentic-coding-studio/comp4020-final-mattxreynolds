import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import type { Context } from "hono";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function fileAt(path: string): string | null {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

// Serves the built SPA from `root`. Files are precompressed (.br, .gz) when
// the image was built, so a request costs a read, not a compression. Vite
// hashes everything under /assets/, so those are immutable; index.html is
// no-cache so a deploy shows up on the next load (ADR 0007).
export function serveSpa(root: string) {
  return (c: Context) => {
    const path = new URL(c.req.url).pathname;
    const requested = normalize(join(root, path));
    if (requested !== root && !requested.startsWith(root + sep)) return c.notFound();

    const isAsset = path.startsWith("/assets/");
    // unknown non-asset paths get the SPA shell; a missing asset is a 404
    const file = fileAt(requested) ?? (isAsset || extname(path) ? null : fileAt(join(root, "index.html")));
    if (!file) return c.notFound();

    const headers: Record<string, string> = {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
      Vary: "Accept-Encoding",
    };
    const accepts = c.req.header("accept-encoding") ?? "";
    for (const [token, suffix] of [["br", ".br"], ["gzip", ".gz"]] as const) {
      if (accepts.includes(token) && existsSync(file + suffix)) {
        headers["Content-Encoding"] = token;
        return c.body(readFileSync(file + suffix), 200, headers);
      }
    }
    return c.body(readFileSync(file), 200, headers);
  };
}
