// api/smtp-test.js - Test SMTP configuration
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSMTP() {
  console.log('Testing SMTP configuration...');
  
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection successful');
    
    // Send test email
    const testOTP = '123456';
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: testEmail,
      subject: 'Test OTP - Seek Unique Timer',
      html: `
        <h2>Test OTP Code</h2>
        <p>Your test OTP is: <strong>${testOTP}</strong></p>
        <p>This is a test email to verify SMTP configuration.</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully');
    console.log('Message ID:', info.messageId);
    
  } catch (error) {
    console.error('❌ SMTP test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check your .env file has correct SMTP settings');
    console.log('2. For Gmail: use App Password, not regular password');
    console.log('3. Enable 2-factor authentication and generate App Password');
    console.log('4. Check if less secure apps is enabled (if not using App Password)');
  }
}

testSMTP();