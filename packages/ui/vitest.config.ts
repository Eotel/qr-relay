import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
