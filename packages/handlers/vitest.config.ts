import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "handlers",
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
