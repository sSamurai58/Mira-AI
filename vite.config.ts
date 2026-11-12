import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs so Electron loadFile(file://) can resolve CSS/JS.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Settings → Integrations writes project `.env` via IPC. If Vite watches
    // that file, every Save full-reloads the renderer (blank UI / destroyed
    // execution context). Keep secrets/config out of the HMR graph.
    watch: {
      ignored: ["**/.env", "**/.env.*", "**/data/**", "**/mira/**"],
    },
    // Browser-demo LLM calls (CORS bypass). Keys stay in the browser request.
    proxy: {
      "/mira-llm/xai": {
        target: "https://api.x.ai",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/mira-llm\/xai/, "/v1"),
      },
      "/mira-llm/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/mira-llm\/openai/, "/v1"),
      },
      "/mira-llm/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/mira-llm\/anthropic/, ""),
      },
      "/mira-llm/gemini": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/mira-llm\/gemini/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ["pdfjs-dist", "tesseract.js"],
  },
  worker: {
    format: "es",
  },
});
