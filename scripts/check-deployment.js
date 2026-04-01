// scripts/check-deployment.js - Check if deployment files are correct
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking backend deployment setup...\n');

const rootDir = process.cwd();
const checks = {
  serverJs: { path: path.join(rootDir, 'src', 'server.js'), required: true },
  distApp: { path: path.join(rootDir, 'dist', 'app.js'), required: false },
  packageJson: { path: path.join(rootDir, 'package.json'), required: true },
  envFile: { path: path.join(rootDir, '.env'), required: false },
  nodeModules: { path: path.join(rootDir, 'node_modules'), required: false },
};

let allGood = true;

console.log('📁 File Structure Check:\n');

for (const [name, check] of Object.entries(checks)) {
  const exists = fs.existsSync(check.path);
  const status = exists ? '✅' : (check.required ? '❌' : '⚠️ ');
  const req = check.required ? '(REQUIRED)' : '(optional)';
  
  console.log(`${status} ${name}: ${exists ? 'Found' : 'Missing'} ${req}`);
  console.log(`   Path: ${check.path}`);
  
  if (!exists && check.required) {
    allGood = false;
  }
  
  if (exists && name === 'nodeModules') {
    try {
      const expressExists = fs.existsSync(path.join(check.path, 'express'));
      const mysqlExists = fs.existsSync(path.join(check.path, 'mysql2'));
      console.log(`   - express: ${expressExists ? '✅' : '❌'}`);
      console.log(`   - mysql2: ${mysqlExists ? '✅' : '❌'}`);
      if (!expressExists || !mysqlExists) {
        console.log('   ⚠️  Dependencies may not be installed. Run: npm install --production');
      }
    } catch (e) {
      // Ignore
    }
  }
  
  if (exists && name === 'envFile') {
    try {
      const envContent = fs.readFileSync(check.path, 'utf8');
      const hasDbHost = envContent.includes('DB_HOST');
      const hasDbUser = envContent.includes('DB_USER');
      const hasDbPassword = envContent.includes('DB_PASSWORD');
      const hasDbName = envContent.includes('DB_NAME');
      const hasJwtSecret = envContent.includes('JWT_SECRET');
      const hasFrontendUrl = envContent.includes('FRONTEND_URL');
      
      console.log(`   - DB_HOST: ${hasDbHost ? '✅' : '❌'}`);
      console.log(`   - DB_USER: ${hasDbUser ? '✅' : '❌'}`);
      console.log(`   - DB_PASSWORD: ${hasDbPassword ? '✅' : '❌'}`);
      console.log(`   - DB_NAME: ${hasDbName ? '✅' : '❌'}`);
      console.log(`   - JWT_SECRET: ${hasJwtSecret ? '✅' : '❌'}`);
      console.log(`   - FRONTEND_URL: ${hasFrontendUrl ? '✅' : '❌'}`);
    } catch (e) {
      console.log('   ⚠️  Could not read .env file');
    }
  }
  
  console.log('');
}

console.log('🌍 Environment Check:\n');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`PORT: ${process.env.PORT || 'not set (default: 5000)'}`);
console.log(`DB_HOST: ${process.env.DB_HOST || 'not set'}`);
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set'}`);
console.log('');

if (allGood) {
  console.log('✅ All required files are present!');
  console.log('\n📋 Next steps:');
  console.log('1. Make sure .env file has correct database credentials');
  console.log('2. Set NODE_ENV=production');
  console.log('3. Set PORT to match your server configuration');
  console.log('4. Set FRONTEND_URL=https://app.oxocareers.com');
  console.log('5. Run: npm install --production (if node_modules missing)');
  console.log('6. If using dist/app.js, run: npm run build first');
  console.log('7. Start the application in cPanel Node.js Selector\n');
} else {
  console.log('❌ Some required files are missing!');
  console.log('   Please ensure all files are uploaded correctly.\n');
}
