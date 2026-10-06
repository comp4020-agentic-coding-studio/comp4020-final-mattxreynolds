import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The client lives in client/ and builds to dist/client, which the Express
// server serves in production. In dev the server runs Vite as middleware, so
// everything is on one port (8080), the same as production.
export default defineConfig({
  root: "client",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true },
});
