import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      crypto: new URL("./src/shims/crypto.ts", import.meta.url).pathname,
      util: new URL("./src/shims/util.ts", import.meta.url).pathname
    }
  },
  worker: {
    format: "es"
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: {
      "Referrer-Policy": "no-referrer"
    },
    proxy: {
      "/api": "http://127.0.0.1:8080"
    }
  }
});
