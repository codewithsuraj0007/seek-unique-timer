// renderer/login.js
import {
  auth, provider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged
} from './firebase.js';

const ADMIN_EMAILS = ['teamseekunique@gmail.com'];

const btn = document.getElementById('btnLogin');
const msg = document.getElementById('msg');
const say = (t='') => { if(msg) msg.textContent = t; };

// Helpful error messaging
function explain(err){
  const code = err?.code || '';
  if(code.includes('api-key-not-valid')){
    return `Firebase API key invalid for this project. Copy config exactly from Console → Project Settings → SDK setup.`;
  }
  if(code === 'auth/operation-not-supported-in-this-environment'){
    return `Add 127.0.0.1 and localhost in Authentication → Settings → Authorized domains.`;
  }
  if(code === 'auth/unauthorized-domain'){
    return `This origin is not authorized. Add 127.0.0.1 and localhost in Authorized domains.`;
  }
  if(code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user'){
    return `Popup blocked/closed. Trying redirect sign-in…`;
  }
  return err?.message || String(err);
}

btn.addEventListener('click', async () => {
  say('');
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const tip = explain(err);
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
      say(tip);
      try { await signInWithRedirect(auth, provider); }
      catch (e2) { alert('Login failed: ' + explain(e2)); }
    } else {
      alert('Login failed: ' + tip);
    }
  }
});

// If a redirect flow completed
getRedirectResult(auth).catch(()=>{});

// Route on auth state
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const isAdmin = ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
  window.location.href = isAdmin ? './admin.html' : './app.html';
});