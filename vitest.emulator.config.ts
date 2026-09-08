import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Tests that talk to the Firebase emulator (docs/team-activity-calendar-spec.md):
//   - src/test/rules/**        Firestore Security Rules (@firebase/rules-unit-testing)
//   - src/test/integration/**  server logic against a real emulator (firebase-admin)
//
// They run separately from the default `vitest run`:
//
//   npm run test:emulator      # spins up the emulator via firebase-tools
//
// or, with an emulator already running (`npm run emulators`):
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 vitest run --config vitest.emulator.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 40000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
