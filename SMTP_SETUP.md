# SMTP Setup Guide for OTP Emails

## Quick Fix - Visual OTP Display

The system now shows OTP codes visually on screen when email fails. You'll see a green box in the top-right corner with your OTP code.

## Gmail Setup (Recommended)

### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification if not already enabled

### Step 2: Generate App Password
1. Go to Google Account > Security > App passwords
2. Select "Mail" and your device
3. Copy the 16-character app password

### Step 3: Configure .env File
Edit `api/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=your-email@gmail.com
TEST_EMAIL=your-test-email@gmail.com
```

### Step 4: Test SMTP
```bash
cd api
npm run test-smtp
```

## Alternative Email Providers

### Outlook/Hotmail
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Yahoo Mail
```
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

## Testing Without Email

If you can't set up email immediately:

1. **Visual OTP**: The system shows OTP codes on screen
2. **Console Logs**: Check browser console and server logs for OTP codes
3. **Skip Email**: The system works without email - just use the displayed OTP

## Troubleshooting

### Common Issues:
- **"Invalid login"**: Use App Password, not regular password
- **"Connection refused"**: Check firewall/antivirus blocking port 587
- **"Authentication failed"**: Verify email and app password are correct

### Test Commands:
```bash
# Test SMTP configuration
cd api
npm run test-smtp

# Check server logs
npm start
# Look for "📧 OTP for email: 123456" messages
```

The system will work with or without email - OTP codes are displayed visually for testing.