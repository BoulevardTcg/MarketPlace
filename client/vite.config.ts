import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:8081",
      "/me": "http://localhost:8081",
      "/marketplace": "http://localhost:8081",
      "/trade": "http://localhost:8081",
      "/cards": "http://localhost:8081",
      "/collection": "http://localhost:8081",
      "/users": "http://localhost:8081",
      "/analytics": "http://localhost:8081",
      "/alerts": "http://localhost:8081",
      "/handovers": "http://localhost:8081",
      "/upload": "http://localhost:8081",
      "/reports": "http://localhost:8081",
      "/admin": "http://localhost:8081",
      "/internal": "http://localhost:8081",
    },
  },
});
