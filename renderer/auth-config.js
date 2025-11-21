// renderer/auth-config.js - Authentication configuration and feature flags

export const AUTH_CONFIG = {
  // Feature flags
  PIN_AUTH_ENABLED: true, // Set to false to disable PIN authentication
  GOOGLE_AUTH_FALLBACK: false, // Set to true to allow Google auth as fallback
  
  // API Configuration
  API_BASE_URL: 'http://localhost:3001',
  
  // Session Configuration
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  
  // PIN Configuration
  PIN_LENGTH: 6,
  PIN_ATTEMPTS_LIMIT: 3,
  PIN_LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes in milliseconds
  
  // OTP Configuration
  OTP_LENGTH: 6,
  OTP_EXPIRY: 10 * 60 * 1000, // 10 minutes in milliseconds
  OTP_RESEND_COOLDOWN: 60 * 1000, // 1 minute in milliseconds
  
  // UI Configuration
  SHOW_DEMO_OTP: true, // Show OTP in console for demo purposes
  AUTO_REDIRECT_DELAY: 2000, // Delay before redirecting after successful actions
  
  // Admin Configuration
  ADMIN_EMAILS: ['teamseekunique@gmail.com'],
  
  // Security Configuration
  REQUIRE_PIN_FOR_ACTIONS: ['cut', 'logout', 'day-end'],
  HASH_ALGORITHM: 'SHA-256'
};

// Helper functions
export function isFeatureEnabled(feature) {
  return AUTH_CONFIG[feature] === true;
}

export function getApiUrl(endpoint) {
  return `${AUTH_CONFIG.API_BASE_URL}${endpoint}`;
}

export function isAdminEmail(email) {
  return AUTH_CONFIG.ADMIN_EMAILS.includes(email.toLowerCase());
}

export function shouldRequirePin(action) {
  return AUTH_CONFIG.REQUIRE_PIN_FOR_ACTIONS.includes(action.toLowerCase());
}

// Environment detection
export function getEnvironment() {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    return 'production';
  }
  return 'unknown';
}

// Feature flag override for QA/testing
export function overrideFeatureFlag(flag, value) {
  if (getEnvironment() === 'development') {
    AUTH_CONFIG[flag] = value;
    console.log(`Feature flag ${flag} overridden to:`, value);
  } else {
    console.warn('Feature flag overrides only allowed in development environment');
  }
}

// Export for global access
if (typeof window !== 'undefined') {
  window.AUTH_CONFIG = AUTH_CONFIG;
  window.overrideFeatureFlag = overrideFeatureFlag;
}