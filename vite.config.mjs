import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Enable runes mode for Svelte 5
        runes: true
      }
    })
  ],
  root: "src/renderer",
  build: {
    outDir: "../../dist",
    rollupOptions: {
      input: path.resolve("src/renderer/index.html")
    },
    emptyOutDir: true
  },
  base: "./",
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      "@": path.resolve("src/renderer")
    }
  }
});
