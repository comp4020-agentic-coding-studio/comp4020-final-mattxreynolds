import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// The SPA builds to dist/, which server/ serves (ADR 0006).
export default defineConfig({ plugins: [svelte()] });
