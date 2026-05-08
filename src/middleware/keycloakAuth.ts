import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const issuerUrl = (() => {
  const base = (process.env.KC_URL || "http://localhost:5400").replace(
    /\/$/,
    "",
  );
  const realm = process.env.KC_REALM || "hris";
  return `${base}/realms/${realm}`;
})();

const jwksUri = `${issuerUrl}/protocol/openid-connect/certs`;

const parseAudience = (): string[] | undefined => {
  const fromEnv = (process.env.KC_AUDIENCE || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const fallbackClients = [
    process.env.KC_BACKEND_CLIENT_ID,
    process.env.KC_FRONTEND_CLIENT_ID,
  ].filter(Boolean) as string[];

  const audiences = Array.from(new Set([...fromEnv, ...fallbackClients]));
  return audiences.length > 0 ? audiences : undefined;
};

const audience = parseAudience(); // optional — if unset, audience is not enforced

const JWKS = createRemoteJWKSet(new URL(jwksUri), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
});

export interface KeycloakClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

export interface VerifyResult {
  claims: KeycloakClaims;
}

export const verifyKeycloakToken = async (
  token: string,
): Promise<VerifyResult> => {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: issuerUrl,
    ...(audience ? { audience } : {}),
  });
  return { claims: payload as KeycloakClaims };
};

export const keycloakConfig = {
  issuerUrl,
  jwksUri,
  audience,
};
