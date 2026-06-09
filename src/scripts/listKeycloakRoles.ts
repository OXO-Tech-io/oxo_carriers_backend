import { keycloakAdminService } from '../services/keycloakAdmin.service';

// We want to access the roles list.
// Let's modify keycloakAdmin.service.ts or write a local fetch call here using the token from keycloakAdminService.
import { env } from '../config/env';

async function main() {
  const KC_URL = env.KC_URL.replace(/\/$/, '');
  const REALM = env.KC_REALM;
  const CLIENT_ID = env.KC_BACKEND_CLIENT_ID;
  const CLIENT_SECRET = env.KC_BACKEND_CLIENT_SECRET;

  const getServiceAccountToken = async (): Promise<string> => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET || '',
    });
    const res = await fetch(`${KC_URL}/realms/${REALM}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  };

  try {
    const token = await getServiceAccountToken();
    const res = await fetch(`${KC_URL}/admin/realms/${REALM}/roles`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      console.error('Failed to get roles:', await res.text());
      return;
    }
    const roles = await res.json();
    console.log('Available Keycloak Roles:');
    console.log(JSON.stringify(roles, null, 2));
  } catch (error) {
    console.error('Error listing roles:', error);
  }
}

main();
