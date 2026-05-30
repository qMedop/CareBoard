/* cite: uploaded:vite.config.js */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true, // Allows network connections
    allowedHosts: [
      "unworried-sinister-chapter.ngrok-free.dev", // FIXED: Safelists your ngrok tunnel URL
    ],
  },
});
