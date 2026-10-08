import { env } from '../config/env';
import { keycloakAdminService } from '../modules/users/keycloakAdmin.service';
import { UserRole } from '../types';

async function main() {
  console.log('🏁 Starting Keycloak Admin REST API Integration Diagnostics...');
  console.log('========================================================================');
  console.log(`KC_URL:                  ${env.KC_URL}`);
  console.log(`KC_REALM:                ${env.KC_REALM}`);
  console.log(`KC_BACKEND_CLIENT_ID:    ${env.KC_BACKEND_CLIENT_ID}`);
  console.log(`KC_BACKEND_CLIENT_SECRET: ${env.KC_BACKEND_CLIENT_SECRET ? '✓ SET' : '✗ MISSING'}`);
  console.log('========================================================================');

  const testEmail = `test.provision.${Date.now()}@example.com`;

  try {
    console.log('\n🚀 Testing service account token retrieval...');
    // The keycloakAdminService will call getServiceAccountToken internally.
    // Let's run a test user creation
    console.log(`\n👤 Step 1 & 2: Provisioning test user in Keycloak: ${testEmail}...`);
    const kcSub = await keycloakAdminService.createUser({
      email: testEmail,
      firstName: 'Diagnostics',
      lastName: 'User',
      password: 'InitialPassword@123',
      temporaryPassword: false,
      role: UserRole.EMPLOYEE,
    });
    console.log(`✓ Success! User created/resolved in Keycloak. ID (UUID): ${kcSub}`);

    console.log('\n🔑 Step 3: Testing password update (reset-password)...');
    await keycloakAdminService.updatePassword(kcSub, 'UpdatedPassword@123');
    console.log('✓ Success! Password updated in Keycloak.');

    console.log('\n========================================================================');
    console.log('🎉 Diagnostics Completed: Keycloak integration is fully functional!');
    console.log('========================================================================');
  } catch (error: any) {
    console.error('\n❌ Diagnostics Failed!');
    console.error('Error Details:', error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

main();
