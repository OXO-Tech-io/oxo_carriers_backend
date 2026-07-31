import { describe, it, expect, vi, beforeEach } from "vitest";

const { jwtVerifyMock, createRemoteJWKSetMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
  createRemoteJWKSetMock: vi.fn().mockReturnValue("jwks-set"),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: (...args: unknown[]) => jwtVerifyMock(...args),
}));

import { verifyKeycloakToken, keycloakConfig } from "../../src/middleware/keycloakAuth";

describe("keycloakAuth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the issuer and JWKS URIs from KC_URL/KC_REALM", () => {
    expect(keycloakConfig.issuerUrl).toContain("/realms/");
    expect(keycloakConfig.jwksUri).toBe(`${keycloakConfig.issuerUrl}/protocol/openid-connect/certs`);
  });

  it("verifies a token and returns its claims", async () => {
    const payload = { sub: "sub-1", email: "user@example.com" };
    jwtVerifyMock.mockResolvedValue({ payload });

    const result = await verifyKeycloakToken("some-token");
    expect(result.claims).toEqual(payload);
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      "some-token",
      "jwks-set",
      expect.objectContaining({ issuer: keycloakConfig.issuerUrl }),
    );
  });

  it("propagates a rejection when verification fails", async () => {
    jwtVerifyMock.mockRejectedValue(new Error("invalid signature"));
    await expect(verifyKeycloakToken("bad-token")).rejects.toThrow("invalid signature");
  });
});
