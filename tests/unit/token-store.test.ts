import { describe, it, expect, beforeEach } from "vitest";
import { passwordResetTokens } from "../../src/utils/tokenStore";

describe("tokenStore", () => {
  beforeEach(() => {
    passwordResetTokens.clear();
  });

  it("stores and retrieves token metadata", () => {
    const expiresAt = new Date("2026-01-01T00:00:00.000Z");
    passwordResetTokens.set("token-1", { userId: 42, expiresAt });

    expect(passwordResetTokens.get("token-1")).toEqual({
      userId: 42,
      expiresAt,
    });
  });
});
