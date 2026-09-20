import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Chompy PWA — Vite builds the React client into dist/client, which the Worker
// serves as static assets. `/api` is proxied to `wrangler dev` during local
// frontend development (npm run dev + npm run dev:worker in parallel).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Custom service worker (injectManifest) so we can handle Web Push +
      // notification clicks for meal reminders, on top of Workbox precaching.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Chompy",
        short_name: "Chompy",
        description: "Log your food, eat all your colours.",
        theme_color: "#C67139",
        background_color: "#F9F4ED",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
