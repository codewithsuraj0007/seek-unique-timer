// renderer/login.js
import {
  auth,
  provider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged
} from './firebase.js';

const ADMIN_EMAILS = ['teamseekunique@gmail.com'];

const btn = document.getElementById('btnLogin');
const msg = document.getElementById('msg');
const say = (t = '') => { if (msg) msg.textContent = t; };

const IS_ELECTRON =
  !!window.eTimer ||
  (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || ''));

let didRoute = false; // prevent double redirects

// --- Clear message when typing/clicking again
btn?.addEventListener('mousedown', () => say(''));

// Human-readable errors
function explain(err) {
  const code = err?.code || '';
  const message = err?.message || '';

  if (code.includes('api-key-not-valid')) {
    return 'Firebase API key is invalid for this project. In Firebase Console → Project settings → General → Your apps, copy the exact Web SDK config.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Add 127.0.0.1 and localhost in Firebase Auth → Settings → Authorized domains.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This origin is not authorized. Add 127.0.0.1 and localhost in Firebase Auth → Authorized domains.';
  }
  if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
    return 'Popup was blocked or closed. Switching to redirect sign-in…';
  }

  // Common Google/OAuth hints that show up as generic errors:
  if (/invalid_client|origin_mismatch|redirect_uri_mismatch/i.test(message)) {
    return 'Google OAuth is misconfigured. In Firebase Auth → Sign-in method → Google, ensure the Web client is set up and Authorized domains include your app origin.';
  }

  return message || String(err);
}

async function runPopupThenFallback() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const tip = explain(err);
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
      say(tip);
      await signInWithRedirect(auth, provider);
    } else {
      // For Electron and other environments that dislike popups, try redirect once.
      if (IS_ELECTRON) {
        say('Using redirect sign-in…');
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (e2) {
          alert('Login failed: ' + explain(e2));
          throw e2;
        }
      }
      alert('Login failed: ' + tip);
      throw err;
    }
  }
}

btn?.addEventListener('click', async () => {
  if (!btn) return;

  // Basic offline guard
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    say('You appear to be offline. Please check your internet connection.');
    return;
  }

  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Signing in…';
  say('');

  try {
    // Prefer redirect on Electron (popups are flaky inside modal windows).
    if (IS_ELECTRON) {
      await signInWithRedirect(auth, provider);
    } else {
      await runPopupThenFallback();
    }
  } finally {
    // Button will re-enable on next page load if redirect happens
    btn.disabled = false;
    btn.textContent = old;
  }
});

// Handle the redirect completion (no-op if there wasn’t one)
getRedirectResult(auth).catch(() => { /* ignore */ });

// Single routing place
onAuthStateChanged(auth, (user) => {
  if (!user || didRoute) return;
  didRoute = true;

  const isAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
  // If you want to force everyone to app.html (and hide/remove "This Work / My WorkLog" there),
  // change the next line to: window.location.href = './app.html';
  window.location.href = isAdmin ? './admin.html' : './app.html';
});
