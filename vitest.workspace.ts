import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/client",
  "apps/server",
  "packages/core",
  "packages/handlers",
  "packages/ui",
]);
