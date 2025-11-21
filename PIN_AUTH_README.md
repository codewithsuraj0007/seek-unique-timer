# PIN-Based Authentication System

This document describes the new PIN-based authentication system implemented for the Seek Unique Timer application.

## Overview

The system replaces Google OAuth with a secure PIN-based authentication flow that includes:
- Email/password signup with OTP verification
- 6-digit PIN creation and login
- PIN verification for sensitive actions (Cut/Day-Logout)
- Rate limiting and security measures

## Features

### 1. Entry Screen
- Two buttons: **Signup** (new users) and **Login** (existing users)
- Clean, consistent UI matching the existing design

### 2. Signup Flow
1. **Email + Password**: User enters credentials
2. **OTP Verification**: 6-digit code sent to email
3. **PIN Creation**: User creates and confirms 6-digit PIN
4. **Account Creation**: User data saved with hashed credentials

### 3. Login Flow
- **Email + PIN**: Simple login with email and 6-digit PIN
- Session management with 24-hour timeout
- Generic error messages for security

### 4. Action Verification
- **Cut Action**: Requires PIN verification before execution
- **Day-Logout**: Requires PIN verification before logout
- Modal popup with PIN input for verification

## Security Features

- **Password Hashing**: bcrypt with 12 rounds
- **PIN Hashing**: bcrypt with 12 rounds  
- **Rate Limiting**: 5 attempts per 15 minutes for auth, 3 attempts per 5 minutes for OTP
- **OTP Expiry**: 10-minute expiration for email verification
- **Session Timeout**: 24-hour automatic logout
- **Generic Errors**: No information disclosure about which field is wrong

## File Structure

```
renderer/
├── auth-entry.html          # Entry screen with Signup/Login buttons
├── auth-signup.html         # Signup flow (3 steps)
├── auth-login.html          # Login with email + PIN
├── auth-signup.js           # Signup logic and OTP handling
├── auth-login.js            # Login authentication logic
├── pin-verification.js      # PIN verification for actions
├── auth-config.js           # Feature flags and configuration
└── login.html               # Updated to redirect to new system

api/
├── server.js                # Express server
├── auth.js                  # Authentication routes
├── package.json             # Dependencies
└── .env.example             # Environment configuration template
```

## Setup Instructions

### 1. Install API Dependencies
```bash
cd api
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your SMTP settings for OTP emails
```

### 3. Start Authentication API
```bash
cd api
npm start
# API will run on http://localhost:3001
```

### 4. Update Configuration
Edit `renderer/auth-config.js` to configure:
- API base URL
- Feature flags
- Security settings

## API Endpoints

- `POST /auth/check-email` - Check if email exists and has PIN
- `POST /auth/send-otp` - Send OTP to email address
- `POST /auth/verify-otp` - Verify OTP code
- `POST /auth/signup` - Complete signup with email/password/PIN
- `POST /auth/login` - Login with email and PIN
- `POST /auth/verify-pin` - Verify PIN for actions

## Feature Flags

The system includes toggleable features via `AUTH_CONFIG`:

```javascript
// Enable/disable PIN authentication
PIN_AUTH_ENABLED: true

// Require PIN for specific actions
REQUIRE_PIN_FOR_ACTIONS: ['cut', 'logout', 'day-end']

// Show demo OTP in console (development only)
SHOW_DEMO_OTP: true
```

## Database Changes

### Users Collection (Firestore)
```javascript
{
  email: "user@example.com",           // Unique identifier
  password_hash: "bcrypt_hash",        // Hashed password
  pin_hash: "bcrypt_hash",            // Hashed PIN
  pin_created: true,                   // PIN setup completion flag
  pin_created_at: timestamp,           // PIN creation time
  last_login_at: timestamp,            // Last successful login
  created_at: timestamp                // Account creation time
}
```

## Security Considerations

1. **Never store plaintext passwords or PINs**
2. **Use proper HTTPS in production**
3. **Configure SMTP securely for OTP emails**
4. **Implement proper session management**
5. **Monitor for brute force attempts**
6. **Regular security audits**

## Backward Compatibility

- Existing Google Auth users will be redirected to signup
- No changes to existing timer/logging functionality
- Cut and Day-Logout actions now require PIN verification
- Feature can be disabled via configuration flags

## Testing

### QA Testing Steps
1. **Signup Flow**:
   - Test with invalid email formats
   - Test with weak passwords
   - Test OTP verification (check console for demo OTP)
   - Test PIN creation with mismatched PINs
   - Test duplicate email registration

2. **Login Flow**:
   - Test with correct email/PIN
   - Test with incorrect credentials
   - Test session persistence

3. **Action Verification**:
   - Test Cut action with correct PIN
   - Test Day-Logout with correct PIN
   - Test with incorrect PIN
   - Test PIN modal cancellation

### Development Testing
```javascript
// Override feature flags in browser console
overrideFeatureFlag('PIN_AUTH_ENABLED', false);  // Disable PIN auth
overrideFeatureFlag('SHOW_DEMO_OTP', true);      // Show OTP in console
```

## Admin Notifications

The system can be configured to send admin notifications on:
- New user signups
- Failed login attempts
- Security events

Configure webhook URL in `.env` file:
```
ADMIN_NOTIFICATION_WEBHOOK=https://your-webhook-url.com/admin
```

## Troubleshooting

### Common Issues
1. **OTP not received**: Check SMTP configuration in `.env`
2. **API connection failed**: Ensure API server is running on port 3001
3. **PIN verification fails**: Check browser console for errors
4. **Session expires**: Sessions timeout after 24 hours

### Debug Mode
Set `SHOW_DEMO_OTP: true` in auth-config.js to see OTP codes in browser console during development.

## Production Deployment

1. **Set up proper SMTP service** (SendGrid, AWS SES, etc.)
2. **Use environment variables** for sensitive configuration
3. **Enable HTTPS** for all communications
4. **Set up proper database** (replace in-memory storage)
5. **Configure rate limiting** based on your needs
6. **Set up monitoring** and alerting
7. **Regular security updates** for dependencies

## Support

For issues or questions about the PIN authentication system:
1. Check the troubleshooting section
2. Review browser console for errors
3. Check API server logs
4. Verify configuration settings