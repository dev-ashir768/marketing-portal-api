import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Injected into process.env before any test module loads — more reliable than
    // a setupFiles side-effect, since vitest's default (non-isolated) pool can run
    // multiple test files in one shared module registry/worker.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "mysql://test:test@localhost:3306/test",
      JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
      TOKEN_ENCRYPTION_KEY: "96d3b96ffa9e50b3ceaabb0f66ff20f8c20687980ebdde3c2fa23537b040067c",
      META_OAUTH_REDIRECT_URI: "http://localhost:4000/api/v1/meta-accounts/oauth/callback",
      FRONTEND_URL: "http://localhost:3000",
    },
  },
});
