// renderer/lunch-scheduler.js
// Minimal, non-invasive daily lunch popup scheduler for active users.
// Place this file in the same folder as your other renderer/*.js files.

import { auth, onAuthStateChanged } from './firebase.js'; // adjust path only if your firebase.js is in other folder

// CONFIG
const LUNCH_HOUR = 14;   // 2 PM
const LUNCH_MIN  = 30;   // :30
const POPUP_ID = 'dailyLunchPopup_v1';

// Keep track of signed in user
let __currentUser = null;
onAuthStateChanged(auth, user => { __currentUser = user; });

// Utility: ms until next occurrence of hour:min (local time)
function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

// Find a safe way to trigger the main lunch action without modifying existing code.
// Priority:
// 1) window.startLunch (if app exposes it), 2) button with common ids, 3) any button whose text includes "lunch".
function getLunchTrigger() {
  if (typeof window.startLunch === 'function') return () => window.startLunch();

  const ids = ['mainLunchBtn','lunchBtn','btn-lunch','btnLunch'];
  for (const id of ids) {
    const el = document.getElementById(id) || document.querySelector(`button.${id}`);
    if (el) return () => el.click();
  }

  // fallback: look for button with "lunch" in text
  const buttons = Array.from(document.querySelectorAll('button'));
  const match = buttons.find(b => /lunch/i.test(b.textContent?.trim()));
  if (match) return () => match.click();

  // if nothing found, return null (we'll show warning)
  return null;
}

// Create (or reuse) popup and mount to body. Returns a function closePopup().
function showPopupForUser(username, onLunchFn, onDismissFn) {
  if (document.getElementById(POPUP_ID)) return; // already shown

  // basic styles (scoped)
  const styleId = `${POPUP_ID}_style`;
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${POPUP_ID} { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index:99999; }
      #${POPUP_ID} .backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.35); }
      #${POPUP_ID} .card { position:relative; z-index:1; width:320px; max-width:90%; background:#fff; border-radius:10px; padding:18px; box-shadow:0 6px 24px rgba(0,0,0,0.2); font-family:system-ui,Segoe UI,Roboto,'Helvetica Neue',Arial; }
      #${POPUP_ID} .title { font-size:16px; font-weight:600; margin-bottom:8px; }
      #${POPUP_ID} .text { font-size:14px; color:#333; margin-bottom:14px; }
      #${POPUP_ID} .btns { display:flex; gap:10px; justify-content:flex-end; }
      #${POPUP_ID} button { padding:8px 12px; border-radius:8px; border:1px solid #ddd; background:#fff; cursor:pointer; }
      #${POPUP_ID} button.primary { background:#1d4ed8; color:white; border-color:transparent; }
    `;
    document.head.appendChild(style);
  }

  const container = document.createElement('div');
  container.id = POPUP_ID;

  container.innerHTML = `
    <div class="backdrop"></div>
    <div class="card" role="dialog" aria-modal="true">
      <div class="title">Lunch time</div>
      <div class="text">Hey ${escapeHtml(username || 'there')}, lunch is start.</div>
      <div class="btns">
        <button id="${POPUP_ID}_dismiss">Dismiss</button>
        <button id="${POPUP_ID}_lunch" class="primary">Lunch</button>
      </div>
    </div>
  `;

  // append
  document.body.appendChild(container);

  const dismissBtn = document.getElementById(`${POPUP_ID}_dismiss`);
  const lunchBtn   = document.getElementById(`${POPUP_ID}_lunch`);
  const backdrop   = container.querySelector('.backdrop');

  const close = () => {
    container.remove();
  };

  dismissBtn.addEventListener('click', () => {
    try { if (typeof onDismissFn === 'function') onDismissFn(); } catch (e) {}
    close();
  });

  backdrop.addEventListener('click', () => {
    try { if (typeof onDismissFn === 'function') onDismissFn(); } catch (e) {}
    close();
  });

  lunchBtn.addEventListener('click', async () => {
    // call the lunch logic (re-use existing main lunch button)
    try {
      if (typeof onLunchFn === 'function') await onLunchFn();
    } catch (err) {
      console.warn('Lunch trigger failed:', err);
    } finally {
      close();
    }
  });

  // ESC to close
  const escHandler = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  return close;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`=\/]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[c]));
}

// This function -> tries to show popup if user active and signed-in.
async function triggerLunchPopupIfActive() {
  try {
    // Only for visible tab (active user)
    if (document.visibilityState !== 'visible') return;

    // require signed-in user (safety)
    if (!__currentUser) return;

    const username = __currentUser.displayName || __currentUser.email || __currentUser.uid;

    // get lunch trigger
    const lunchTrigger = getLunchTrigger();

    // define onLunch function that calls the trigger
    const onLunch = async () => {
      if (lunchTrigger) {
        try {
          // Call lunch action
          await lunchTrigger();
        } catch (err) {
          console.warn('Error calling lunch trigger:', err);
        }
      } else {
        console.warn('No lunch trigger found on page. Please ensure a Lunch button exists or expose window.startLunch().');
      }
    };

    // Show popup
    showPopupForUser(username, onLunch, () => { /* onDismiss: intentionally no-op; do not interrupt timers */ });

  } catch (e) {
    console.error('triggerLunchPopupIfActive error', e);
  }
}

// Initialize the daily schedule: wait until next occurrence then schedule daily repeats.
function initDailyLunchPopup() {
  // schedule first run
  const firstMs = msUntilNext(LUNCH_HOUR, LUNCH_MIN);
  // Safety: if 1st schedule > 25 hours (shouldn't happen) cap
  setTimeout(() => {
    // run immediately at scheduled time
    triggerLunchPopupIfActive();
    // then every 24h
    setInterval(triggerLunchPopupIfActive, 24 * 60 * 60 * 1000);
  }, firstMs);
}

// Expose manual trigger for testing
window.__triggerLunchPopupNow = triggerLunchPopupIfActive;

// Listen for programmatic triggers (e.g., main process via lunch-ipc-bridge)
try{
  window.addEventListener('lunch:popup', (e)=>{ try{ triggerLunchPopupIfActive(); }catch(_){} });
}catch(e){ /* ignore */ }

// Start scheduler after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDailyLunchPopup);
} else {
  initDailyLunchPopup();
}
// End of lunch-scheduler.js