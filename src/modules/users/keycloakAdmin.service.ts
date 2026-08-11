/**
 * Thin client for the Keycloak Admin REST API. Authenticates as the
 * `oxo-carriers-backend` confidential client via the client_credentials grant
 * (the service account, which has the `manage-users` realm-management role).
 *
 * Used to provision Keycloak identities when HR creates a user record.
 */
import { UserRole } from '../../types';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';

const KC_URL = env.KC_URL.replace(/\/$/, '');
const REALM = env.KC_REALM;
const CLIENT_ID = env.KC_BACKEND_CLIENT_ID;
const CLIENT_SECRET = env.KC_BACKEND_CLIENT_SECRET;
// Optional: used to build the post-action redirect for onboarding emails.
// Keycloak requires BOTH client_id and redirect_uri together; if either is
// missing we omit both and the user lands on Keycloak's generic confirmation
// page instead of being bounced back to the app.
const FRONTEND_CLIENT_ID = env.KC_FRONTEND_CLIENT_ID;
const FRONTEND_URL = env.FRONTEND_URL?.replace(/\/$/, '');

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
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  requiredActions?: string[];
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
  const res = await adminFetch(`/roles`);
  if (!res.ok) {
    throw new AppError(
      `Keycloak realm role '${name}' not found — create it in Keycloak first`,
      502
    );
  }
  const roles = (await res.json()) as Array<{ id: string; name: string }>;
  const found = roles.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new AppError(
      `Keycloak realm role '${name}' not found — create it in Keycloak first`,
      502
    );
  }
  return found;
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
        // Left unverified on purpose: the onboarding email below carries the
        // VERIFY_EMAIL action so the user verifies and sets their password in
        // one Keycloak-hosted flow.
        emailVerified: false,
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

  /**
   * Triggers Keycloak to email the user a secure link to complete the given
   * required actions (e.g. set their password and verify their email). This
   * is how onboarding/password-reset works now that Keycloak owns identity —
   * the app no longer mints its own reset tokens.
   *
   * Requires the Keycloak realm to have SMTP configured (Realm Settings →
   * Email). If SMTP is missing this returns a 502 with Keycloak's message.
   *
   * @param userId  Keycloak user id (the `sub`).
   * @param actions Required actions, e.g. ['VERIFY_EMAIL', 'UPDATE_PASSWORD'].
   * @param lifespanSeconds  How long the link stays valid. Defaults to 12h.
   */
  async sendRequiredActionsEmail(
    userId: string,
    actions: string[],
    lifespanSeconds = 12 * 60 * 60
  ): Promise<void> {
    const params = new URLSearchParams({ lifespan: String(lifespanSeconds) });
    // Only attach a redirect when we have both halves — Keycloak rejects a
    // redirect_uri without a client_id, and the redirect_uri must be in the
    // client's "Valid redirect URIs".
    if (FRONTEND_CLIENT_ID && FRONTEND_URL) {
      params.set('client_id', FRONTEND_CLIENT_ID);
      params.set('redirect_uri', `${FRONTEND_URL}/login`);
    }
    const res = await adminFetch(
      `/users/${userId}/execute-actions-email?${params.toString()}`,
      { method: 'PUT', body: JSON.stringify(actions) }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(
        `Keycloak send actions email failed (${res.status}): ${text}`,
        502
      );
    }
  },

  async updatePassword(userId: string, password: string, temporary = false): Promise<void> {
    const res = await adminFetch(`/users/${userId}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({
        type: 'password',
        value: password,
        temporary,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(`Keycloak update password failed (${res.status}): ${text}`, 502);
    }
  },

  /**
   * Lists Keycloak realm users (paginated, `first`/`max` map straight to the
   * admin API's own pagination params). Used by the "users" listing so it
   * reflects actual Keycloak-provisioned accounts rather than re-querying the
   * local employee table (which is what `EmployeeModel.getAll` already does).
   */
  async listUsers(options: { first?: number; max?: number; search?: string } = {}): Promise<KcUser[]> {
    const params = new URLSearchParams();
    params.set('first', String(options.first ?? 0));
    params.set('max', String(options.max ?? 200));
    if (options.search) params.set('search', options.search);
    const res = await adminFetch(`/users?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new AppError(`Keycloak list users failed (${res.status}): ${text}`, 502);
    }
    return (await res.json()) as KcUser[];
  },

  /**
   * Deletes the Keycloak user. Tolerates 404 (already gone) so callers can
   * call this unconditionally as part of employee deletion cleanup.
   */
  async deleteUser(userId: string): Promise<void> {
    const res = await adminFetch(`/users/${userId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new AppError(`Keycloak delete user failed (${res.status}): ${text}`, 502);
    }
  },
};
