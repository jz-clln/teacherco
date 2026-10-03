import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/invite-*.test.ts", "tests/invite-*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    pool: "threads",
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
