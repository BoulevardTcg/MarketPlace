import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev sans Caddy proxy : Vite proxy simule le routage reverse-proxy.
// Avec Caddy (port 3000), ces proxies ne sont pas utilisés.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Boutique API (login, refresh, logout, …)
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // Marketplace API — strip /market, le backend attend /me, /trade/...
      "/market": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/market/, ""),
      },
    },
  },
});
