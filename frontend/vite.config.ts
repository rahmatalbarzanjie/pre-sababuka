import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  cacheDir: "../.tmp_sababuka/vite-cache",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        // SABABUKA_API_TARGET mengarahkan dev server ke API lain (mis. produksi) untuk uji tampilan.
        target: process.env.SABABUKA_API_TARGET ?? "http://127.0.0.1:3001",
        changeOrigin: Boolean(process.env.SABABUKA_API_TARGET),
      },
    },
  },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true },
});
