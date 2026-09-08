import { fileURLToPath } from "node:url"

import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Emulator-backed tests (src/test/**) have their own config
    // (vitest.emulator.config.ts) and run via `npm run test:emulator`.
    exclude: [...configDefaults.exclude, "src/test/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
