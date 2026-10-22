import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.VITEST
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            includeAssets: [
              "icons/icon-192.png",
              "icons/icon-512.png",
              "manifest.webmanifest",
            ],
            manifest: false,
            workbox: {
              navigateFallback: null,
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.hostname.includes("supabase.co"),
                  handler: "NetworkOnly",
                },
              ],
            },
          }),
        ]),
  ],
  base: "./",
  test: {
    environment: "node",
  },
});
