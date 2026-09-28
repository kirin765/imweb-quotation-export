import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Neon 무료 티어는 첫 연결에 1~2초가 걸린다. 통합 테스트의 행(hang)을 빨리 잡기 위해 여유를 준다.
    testTimeout: 20_000,
  },
});
