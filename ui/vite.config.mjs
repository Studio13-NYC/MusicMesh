import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(currentDir, "src")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:43101",
        changeOrigin: false
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 3000
  },
  build: {
    outDir: path.join(currentDir, "..", "output", "ui-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(currentDir, "index.html"),
        "graph-cytoscape": path.join(currentDir, "graph-cytoscape.html"),
        "graph-nvl": path.join(currentDir, "graph-nvl.html")
      }
    }
  }
});
