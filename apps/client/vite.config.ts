import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "QR Relay",
        short_name: "QR Relay",
        description: "QR Relay",
        theme_color: "#faf6f1",
        background_color: "#faf6f1",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
    watch: {
      // dev サーバ / HMR は実装コードだけを監視。
      // テスト・E2E・lint/format 設定・ドキュメント類の変更でリロードしない。
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        "**/.wrangler/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/e2e/**",
        "**/playwright.config.*",
        "**/vitest.config.*",
        "**/biome.json",
        "**/*.md",
        "**/docs/**",
      ],
    },
  },
});
