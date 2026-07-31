import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// corsOrigins.ts computes `allowedOrigins` once at module load time from
// env.FRONTEND_URL/ALLOWED_ORIGINS/IS_PRODUCTION, so each scenario needs a
// fresh module instance with a mocked env.
const loadWithEnv = async (envOverrides: Record<string, unknown>) => {
  vi.resetModules();
  vi.doMock("../../src/config/env", () => ({
    env: {
      FRONTEND_URL: undefined,
      ALLOWED_ORIGINS: undefined,
      IS_PRODUCTION: false,
      ...envOverrides,
    },
  }));
  return import("../../src/config/corsOrigins");
};

describe("corsOrigins", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../src/config/env");
  });

  describe("normalizeOrigin", () => {
    it("trims, lowercases, and strips a trailing slash", async () => {
      const { normalizeOrigin } = await loadWithEnv({});
      expect(normalizeOrigin(" HTTPS://Example.com/ ")).toBe("https://example.com");
    });

    it("returns an empty string for null/undefined", async () => {
      const { normalizeOrigin } = await loadWithEnv({});
      expect(normalizeOrigin(null)).toBe("");
      expect(normalizeOrigin(undefined)).toBe("");
    });
  });

  describe("isOriginAllowed", () => {
    it("allows requests with no origin header (e.g. server-to-server, curl)", async () => {
      const { isOriginAllowed } = await loadWithEnv({});
      expect(isOriginAllowed(undefined)).toBe(true);
      expect(isOriginAllowed(null)).toBe(true);
    });

    it("allows an origin listed in FRONTEND_URL", async () => {
      const { isOriginAllowed } = await loadWithEnv({ FRONTEND_URL: "https://app.example.com" });
      expect(isOriginAllowed("https://app.example.com")).toBe(true);
      expect(isOriginAllowed("https://app.example.com/")).toBe(true);
    });

    it("allows an origin listed in ALLOWED_ORIGINS (comma-separated)", async () => {
      const { isOriginAllowed } = await loadWithEnv({
        ALLOWED_ORIGINS: "https://a.example.com,https://b.example.com",
      });
      expect(isOriginAllowed("https://b.example.com")).toBe(true);
    });

    it("rejects an unlisted origin in production", async () => {
      const { isOriginAllowed } = await loadWithEnv({ IS_PRODUCTION: true });
      expect(isOriginAllowed("https://evil.example.com")).toBe(false);
    });

    it("allows localhost origins outside of production even when unlisted", async () => {
      const { isOriginAllowed } = await loadWithEnv({ IS_PRODUCTION: false });
      expect(isOriginAllowed("http://localhost:3000")).toBe(true);
      expect(isOriginAllowed("http://127.0.0.1:3000")).toBe(true);
    });

    it("rejects localhost origins in production", async () => {
      const { isOriginAllowed } = await loadWithEnv({ IS_PRODUCTION: true });
      expect(isOriginAllowed("http://localhost:3000")).toBe(false);
    });

    it("rejects an unlisted non-localhost origin outside production", async () => {
      const { isOriginAllowed } = await loadWithEnv({ IS_PRODUCTION: false });
      expect(isOriginAllowed("https://unlisted.example.com")).toBe(false);
    });
  });
});
