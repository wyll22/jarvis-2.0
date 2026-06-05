import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    watch: {
      // Ignora toda a pasta backend para evitar hot reload indevido
      // causado por logs, sessões do WhatsApp e outros arquivos gerados em runtime
      ignored: [
        "**/backend/**",
        "**/node_modules/**",
        "**/.git/**",
      ],
    },
  },
});
