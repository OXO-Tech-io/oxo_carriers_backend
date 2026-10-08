import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Default (5000ms) is thin margin on a dev machine running many other
    // services concurrently (docker stacks, other projects' dev servers) -
    // bumped so load-induced slowness doesn't get misread as a hung test.
    testTimeout: 15000,
    include: ["tests/unit/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      PORT: "5000",
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_USER: "test_user",
      DB_PASSWORD: "not-used-in-unit-tests", // NOSONAR
      DB_NAME: "test_db",
      DB_SCHEMA: "public",
      DB_SSL: "false",
      KC_URL: "http://localhost:8080",
      KC_REALM: "test-realm",
      KC_BACKEND_CLIENT_ID: "test-backend-client",
      KC_BACKEND_CLIENT_SECRET: "test-client-secret",
      KC_FRONTEND_CLIENT_ID: "test-frontend-client",
      SMTP_HOST: "localhost",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      JWT_SECRET: "test-jwt-secret-key-minimum-32-characters-long",
      JWT_EXPIRES_IN: "1h",
      PII_ENCRYPTION_KEY: "test-pii-encryption-key-32-chars!",
      SALARY_ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      COMMUNICATIONS_DOCUMENT_FIELDS: "document,attachment",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
