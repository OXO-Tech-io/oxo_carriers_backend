import dotenv from 'dotenv';
import path from 'path';
import { sendTestEmail } from '../config/email';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testEmail() {
  console.log('📧 Testing EmailJS Configuration...\n');

  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const recipientEmail = process.argv[2] || 'info@oxocareers.com';

  if (!serviceId || !publicKey || !privateKey) {
    console.error('❌ Error: EMAILJS configuration incomplete in .env!');
    console.log('Ensure you have:');
    console.log(`- EMAILJS_SERVICE_ID: ${serviceId ? '✅' : '❌'}`);
    console.log(`- EMAILJS_PUBLIC_KEY: ${publicKey ? '✅' : '❌'}`);
    console.log(`- EMAILJS_PRIVATE_KEY: ${privateKey ? '✅' : '❌'}`);
    process.exit(1);
  }

  console.log(`📬 Sending test email to: ${recipientEmail}`);
  console.log(`💡 The backend is sending these variables: to_email, to, email, recipient, user_email`);
  console.log(`   Ensure one of these is used in your EmailJS dashboard "To Email" field as {{variable_name}}\n`);

  try {
    const result = await sendTestEmail(recipientEmail);
    if (result.success) {
      console.log('✅ Test email sent successfully!');
      console.log(`\n📬 Please check the inbox (and spam folder) of: ${recipientEmail}`);
      process.exit(0);
    } else {
      console.error(`\n❌ Failed to send test email: ${result.message}`);
      
      if (result.message.includes('API calls are disabled for non-browser applications')) {
        console.log('\n💡 FIX REQUIRED IN EMAILJS DASHBOARD:');
        console.log('1. Log in to https://dashboard.emailjs.com/');
        console.log('2. Go to "Account" (bottom left icon)');
        console.log('3. Select the "Security" tab');
        console.log('4. Enable "Allow API calls from non-browser applications"');
        console.log('5. Click "Apply Changes" and try again.');
      }
      
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error occurred during test:');
    console.error(error.message);
    process.exit(1);
  }
}

testEmail();
