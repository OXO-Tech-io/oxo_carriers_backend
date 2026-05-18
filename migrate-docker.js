#!/usr/bin/env node
/**
 * Migration script that runs inside Docker network
 * This bypasses local PostgreSQL conflicts
 */

const { execSync } = require('child_process');

console.log('🔄 Running Drizzle migration via Docker...\n');

try {
  // Run drizzle-kit push inside a temporary container on the same network
  const result = execSync(
    `docker run --rm --network 01git_oxo-network ` +
    `-v ${process.cwd()}:/app -w /app ` +
    `-e DB_HOST=oxo-postgres ` +
    `-e DB_PORT=5432 ` +
    `-e DB_USER=postgres ` +
    `-e DB_PASSWORD=postgres ` +
    `-e DB_NAME=oxo_carriers ` +
    `node:20-alpine sh -c "npm install -g pnpm && pnpm install && pnpm db:push"`,
    { stdio: 'inherit', shell: 'powershell.exe' }
  );
  
  console.log('\n✅ Migration completed successfully!');
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
}
