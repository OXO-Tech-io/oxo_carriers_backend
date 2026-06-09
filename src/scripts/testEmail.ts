import dotenv from 'dotenv';
import path from 'path';
import { sendTestEmail } from '../config/email';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testEmail() {
  console.log('📧 Testing SMTP Configuration...\n');

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const recipientEmail = process.argv[2] || 'info@oxocareers.com';

  if (!host || !port || !user || !pass) {
    console.error('❌ Error: SMTP configuration incomplete in .env!');
    console.log('Ensure you have:');
    console.log(`- SMTP_HOST: ${host ? '✅' : '❌'}`);
    console.log(`- SMTP_PORT: ${port ? '✅' : '❌'}`);
    console.log(`- SMTP_USER: ${user ? '✅' : '❌'}`);
    console.log(`- SMTP_PASS: ${pass ? '✅' : '❌'}`);
    process.exit(1);
  }

  console.log(`📬 Sending test email to: ${recipientEmail} via SMTP...`);

  try {
    const result = await sendTestEmail(recipientEmail);
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      console.log(`\n📬 Please check the inbox (and spam folder) of: ${recipientEmail}`);
      process.exit(0);
    } else {
      console.error(`\n❌ Failed to send test email: ${result.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error occurred during test:');
    console.error(error.message);
    process.exit(1);
  }
}

testEmail();
