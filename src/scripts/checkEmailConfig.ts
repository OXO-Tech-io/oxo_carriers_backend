import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

console.log('🔍 Email Configuration Diagnostic Tool\n');
console.log('Environment Information:');
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`  Current working directory: ${process.cwd()}`);
console.log(`  __dirname: ${__dirname}\n`);

// Try to load .env
let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) {
      console.log(`✅ Loaded .env from: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  dotenv.config({ override: false });
  console.log('ℹ️  No .env file found, checking process.env only\n');
}

console.log('\n📋 SMTP Configuration Check:');
console.log(`  SMTP_HOST: ${process.env.SMTP_HOST || '✗ NOT SET (default: smtp.gmail.com)'}`);
console.log(`  SMTP_PORT: ${process.env.SMTP_PORT || '✗ NOT SET (default: 587)'}`);
console.log(`  SMTP_USER: ${process.env.SMTP_USER ? '✓ SET (' + process.env.SMTP_USER + ')' : '✗ NOT SET'}`);
console.log(`  SMTP_PASS: ${process.env.SMTP_PASS ? '✓ SET (****)' : '✗ NOT SET'}`);
console.log(`  SMTP_FROM: ${process.env.SMTP_FROM || process.env.SMTP_USER || '✗ NOT SET'}`);

const isConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

console.log('\n' + '='.repeat(50));
if (isConfigured) {
  console.log('✅ EMAIL CONFIGURATION: READY');
  console.log('   Email functionality should work correctly.');
} else {
  console.log('❌ EMAIL CONFIGURATION: NOT READY');
  console.log('   Email functionality will NOT work.');
  console.log('\n   To fix:');
  console.log('   1. Set SMTP_USER and SMTP_PASS in cPanel Node.js Selector');
  console.log('   2. OR create .env file in project root with these variables');
}
console.log('='.repeat(50) + '\n');

process.exit(isConfigured ? 0 : 1);
