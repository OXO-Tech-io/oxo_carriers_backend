/**
 * Thin client for the Keycloak Admin REST API. Authenticates as the
 * `oxo-hris-backend` confidential client via the client_credentials grant
 * (the service account, which has the `manage-users` realm-management role).
 *
 * Used to provision Keycloak identities when HR creates a user record.
 */
import { UserRole } from '../types';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

const KC_URL = env.KC_URL.replace(/\/$/, '');
const REALM = env.KC_REALM;
const CLIENT_ID = env.KC_BACKEND_CLIENT_ID;
const CLIENT_SECRET = env.KC_BACKEND_CLIENT_SECRET;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let _cached: CachedToken | null = null;

const getServiceAccountToken = async (): Promise<string> => {
  if (!CLIENT_SECRET) {
    throw new AppError(
      'KC_BACKEND_CLIENT_SECRET is not configured — cannot reach Keycloak admin API',
      500
    );
  }
  if (_cached && _cached.expiresAt - 30_000 > Date.now()) {
    return _cached.accessToken;
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Keycloak admin token failed (${res.status}): ${text}`, 502);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return _cached.accessToken;
};

const adminFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const token = await getServiceAccountToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${KC_URL}/admin/realms/${REALM}${path}`, { ...init, headers });
};

interface KcUser {
  id: string;
  username: string;
  email: string;
}

const findUserByEmail = async (email: string): Promise<KcUser | null> => {
  const res = await adminFetch(`/users?email=${encodeURIComponent(email)}&exact=true`);
  if (!res.ok) {
    throw new AppError(`Keycloak find user failed (${res.status})`, 502);
  }
  const users = (await res.json()) as KcUser[];
  return users[0] ?? null;
};

const findRealmRole = async (
  name: string
): Promise<{ id: string; name: string }> => {
  const res = await adminFetch(`/roles/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new AppError(
      `Keycloak realm role '${name}' not found — create it in Keycloak first`,
      502
    );
  }
  return (await res.json()) as { id: string; name: string };
};

export interface CreateKeycloakUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  /** If true, the user must change their password on first login. */
  temporaryPassword?: boolean;
  role: UserRole;
}

export const keycloakAdminService = {
  /**
   * Creates the user in Keycloak and assigns the given realm role. If the
   * user already exists (matched by email), the existing record is reused
   * and the role is added to whatever they have.
   *
   * Returns the Keycloak user `sub` (UUID) so the caller can persist it on
   * the local users row.
   */
  async createUser(input: CreateKeycloakUserInput): Promise<string> {
    let kcUser = await findUserByEmail(input.email);

    if (!kcUser) {
      const body = {
        username: input.email,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [
          {
            type: 'password',
            value: input.password,
            temporary: input.temporaryPassword ?? true,
          },
        ],
      };
      const res = await adminFetch('/users', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 409) {
        const text = await res.text();
        throw new AppError(
          `Keycloak create user failed (${res.status}): ${text}`,
          502
        );
      }
      // Conflict means it was created concurrently — re-fetch
      kcUser = await findUserByEmail(input.email);
      if (!kcUser) {
        throw new AppError(
          'Keycloak create user succeeded but user could not be retrieved',
          502
        );
      }
    }

    const role = await findRealmRole(input.role);
    const assignRes = await adminFetch(
      `/users/${kcUser.id}/role-mappings/realm`,
      { method: 'POST', body: JSON.stringify([role]) }
    );
    if (!assignRes.ok) {
      const text = await assignRes.text();
      throw new AppError(
        `Keycloak assign role failed (${assignRes.status}): ${text}`,
        502
      );
    }

    return kcUser.id;
  },
};
