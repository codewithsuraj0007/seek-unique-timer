// renderer/app.js
// Global safety: capture unhandled promise rejections and errors to avoid renderer crash
try{
  window.addEventListener('unhandledrejection', (ev)=>{
    try{ console.warn('Unhandled promise rejection:', ev.reason);}catch(_){}
    // prevent default to avoid noisy console behavior
    try{ ev.preventDefault(); }catch(_){}
  });
  window.addEventListener('error', (ev)=>{
    try{ console.error('Unhandled error:', ev.error || ev.message, ev);}catch(_){}
  });
}catch(e){}
import {
  auth, onAuthStateChanged, updateProfile,
  db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc,
  serverTimestamp, query, where, orderBy, limit, onSnapshot, writeBatch
} from './firebase.js';

// Make Firebase exports available globally for productivity chart
window.firebaseExports = {
  db, collection, query, where, getDocs, doc, getDoc, serverTimestamp, onSnapshot
};

// Wrapper to ensure onSnapshot errors are handled and do not cause uncaught rejections
function safeOnSnapshot(ref, next, label) {
  try {
    return onSnapshot(ref, next, (err) => {
      try { console.warn((label ? label + ' ' : '') + 'onSnapshot error', err);}catch(_){}
    });
  } catch (e) {
    console.warn((label ? label + ' ' : '') + 'onSnapshot setup failed', e);
    return () => {};
  }
}

/* ---------------- Electron overlay helpers (no-op in browser) ---------------- */
const ET = window.eTimer || null;
function ovShow(type, seconds = 0){ try{ ET?.show?.({ type, seconds }); }catch{} }
function ovHide(){ try{ ET?.hide?.(); }catch{} }
function ovUpdate(type, seconds){ try{ ET?.update?.({ type, seconds }); }catch{} }

/* --- Desktop popup helper + Slack mirroring --- */
function showDesktopPopup(title, body) {
  try {
    if (ET?.notify) {
      ET.notify({ title, body }); // desktop, all screens
    } else if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') new Notification(title, { body });
      else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title, { body }); });
      }
    }
  } catch (e) { console.warn('Notification error', e); }
}
try {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(()=>{});
  }
} catch {}

function userDisplay(){
  return lastUser?.displayName || lastUser?.email || lastUser?.uid || 'User';
}
function toLocalDateTime(ms){
  try{
    const d = new Date(ms);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return `${date} ${time}`;
  }catch{ return ''; }
}

/* Accept quick actions from overlay */
try {
  ET?.receiveCmd?.((cmd) => {
    const t = String(cmd || '').toLowerCase();
    if (['work','meeting','lunch','break','smm','activity','copyright'].includes(t)) {
      startOrSwitch(t);
    }
  });
} catch(_) {}

/* ------------------ CONFIG (Slack via Apps Script proxy) ------------------ */
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';
const PROXY_BASE    = 'https://script.google.com/macros/s/AKfycbwKdu8s5-9rQWYlGv0l_2sEYAJ2eN33404EcFolemRrIh9Q7zemR2xpzb0O3GsH__1B/exec';
const DEFAULT_PROXY = `${PROXY_BASE}?hook=${encodeURIComponent(SLACK_WEBHOOK)}`;
// Defaults to 3600 (1 hour). For testing set localStorage key 'WORK_REPORT_INTERVAL_SEC' to 600 (10 min).
const WORK_REPORT_INTERVAL_SEC = Number(localStorage.getItem('WORK_REPORT_INTERVAL_SEC')) || 600;
/* ------------------ DOM ------------------ */
const $ = (id)=>document.getElementById(id);

// Signout UI removed. Previously: const btnLogout = $('btnLogout');
const profileName = $('profileName');
const avatar = $('avatar');
const btnEditProfile = $('btnEditProfile');

const btnWork = $('btnWork');
const btnMeeting = $('btnMeeting');
const btnLunch = $('btnLunch');
const btnBreak = $('btnBreak');
const btnSMM = $('btnSMM');
const btnActivity = $('btnActivity');
const btnCopy = $('btnCopy');          // Copyright Check
const btnDayEnd  = $('btnDayEnd');

const liveClock = $('liveClock');
const liveType  = $('liveType');
const logsEl    = $('logs');
const weeklyEl  = $('weekly');
const totalsEl  = $('totals');

const floating = $('floatingTimer'), ftType=$('ftType'), ftTime=$('ftTime');

const emgWrap       = $('emgWrap');
const btnQuickBreak = $('btnQuickBreak');

// Optionals
const breakModal = $('breakModal');
const skipModal  = $('skipModal');
const editModal  = $('profileModal');
const editName   = $('editName');
const lunchModal = $('lunchModal');
const btnLunchStart = $('btnLunchStart');
const btnLunchContinue = $('btnLunchContinue');

/* -------- Work Report modal: auto-inject if missing (with Back button + logging) -------- */
let hourModal = $('hourModal');
let hourInput = $('hourInput');
let btnHourSubmit = $('btnHourSubmit');
let hourCatSel = $('hourCategory');
let hourTitle  = $('hourTitle');

// Helper: log popup dismissal to Firestore (non-blocking)
async function logPopupDismissal({ kind = 'workSegment', extra = {} } = {}) {
  try {
    if (!db) return;
    await addDoc(collection(db, 'popupLogs'), {
      userId: lastUser?.uid || '',
      kind: String(kind || 'workSegment'),
      action: 'Popup dismissed (Back Button)',
      extra: extra,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('logPopupDismissal failed', err);
  }
}

(function ensureReportModal(){
  if(!hourModal){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div id="hourModal" class="modal">
      <div class="modal-card" style="position:relative;">
        <!-- Back (X) button top-right -->
        <button id="hourClose" class="hour-close" title="Back (dismiss)" style="
          position:absolute; right:12px; top:12px;
          border:none; background:transparent; font-size:20px; cursor:pointer;
          color:var(--text, #111);
        ">✕</button>

        <h3 id="hourTitle">1-Hour Productivity</h3>
        <p id="hourDesc">How much focused work did you complete in the last hour?</p>
        <p style="opacity:.8;margin-top:-6px">Enter time as <b>mm:ss</b> or <b>hh:mm:ss</b> (e.g., <b>48:00</b> or <b>1:40:15</b>)</p>
        <div style="position:relative;margin:10px 0;">
          <input id="hourInput" type="text" placeholder="mm:ss or hh:mm:ss" style="width:100%;padding:10px 40px 10px 10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#000;">
          <button id="timePickerBtn" type="button" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:4px;">🕐</button>
          <div id="timePicker" style="display:none;position:absolute;top:100%;left:0;right:0;background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:15px;z-index:1000;box-shadow:0 8px 32px rgba(0,0,0,0.8);">
            <div style="display:flex;gap:10px;align-items:center;justify-content:center;">
              <div style="text-align:center;">
                <label style="display:block;font-size:12px;margin-bottom:5px;color:#ccc;">Hours</label>
                <input id="hoursPicker" type="number" min="0" max="23" value="0" style="width:60px;padding:8px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#fff;text-align:center;">
              </div>
              <div style="font-size:20px;color:#fff;">:</div>
              <div style="text-align:center;">
                <label style="display:block;font-size:12px;margin-bottom:5px;color:#ccc;">Minutes</label>
                <input id="minutesPicker" type="number" min="0" max="59" value="0" style="width:60px;padding:8px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#fff;text-align:center;">
              </div>
              <div style="font-size:20px;color:#fff;">:</div>
              <div style="text-align:center;">
                <label style="display:block;font-size:12px;margin-bottom:5px;color:#ccc;">Seconds</label>
                <input id="secondsPicker" type="number" min="0" max="59" value="0" style="width:60px;padding:8px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#fff;text-align:center;">
              </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:15px;">
              <button id="applyTime" type="button" style="padding:6px 12px;border-radius:8px;border:none;background:linear-gradient(135deg,#480355,#6b1a7a);color:#fff;cursor:pointer;font-size:12px;">Apply</button>
              <button id="cancelTime" type="button" style="padding:6px 12px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#fff;cursor:pointer;font-size:12px;">Cancel</button>
            </div>
          </div>
        </div>
        <label for="hourCategory" style="display:block;margin-top:6px;">Category <span style="color:#ef4444;">*</span></label>
        <select id="hourCategory" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#000;margin:6px 0">
          <option value="">— Select —</option>
          <option value="layering">Layering</option>
          <option value="trimming">Trimming</option>
          <option value="audio">Audio</option>
          <option value="final_touchups">Final touchups</option>
          <option value="copyright_check">Copyright check</option>
          <option value="review">Review</option>
        </select>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
          <button id="btnHourSubmit" disabled>Submit</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap);
  }
  hourModal = $('hourModal');
  hourInput = $('hourInput');
  btnHourSubmit = $('btnHourSubmit');
  hourCatSel = $('hourCategory');
  hourTitle  = $('hourTitle');

  // Initialize time picker immediately for auto-injected modal
  setTimeout(() => {
    initializeTimePicker();
    // Auto-open time picker on modal creation
    const timePicker = $('timePicker');
    if (timePicker) {
      timePicker.style.display = 'block';
      timePicker.style.opacity = '1';
    }
  }, 0);

  // Keep the simple global handler but it's now non-blocking (we also detect modal hide in openWorkReport)
  const hourCloseBtn = $('hourClose');
  if (hourCloseBtn) {
    hourCloseBtn.addEventListener('click', async (e) => {
      try {
        if (hourModal) hourModal.classList.remove('show');
        if (current && typeof current.hourModalOpen !== 'undefined') {
          current.hourModalOpen = false;
        }
        logPopupDismissal({ kind: 'workSegment', extra: { reason: 'user_clicked_back_button' } });
        // Do NOT call history.back() here: closing the Work Segment Report must only dismiss
        // the modal and resume the current session. Calling history.back() can trigger
        // navigation/unload events which in turn show the Confirm Exit popup (beforeunload).
        // We intentionally avoid navigation to match the requirement: Back = dismiss, not exit.
      } catch (err) {
        console.warn('hourCloseBtn click handler failed', err);
      }
    }, { passive: true });
  }
})();

// Initialize time picker functionality
function initializeTimePicker() {
  const timePickerBtn = $('timePickerBtn');
  const timePicker = $('timePicker');
  const hoursPicker = $('hoursPicker');
  const minutesPicker = $('minutesPicker');
  const secondsPicker = $('secondsPicker');
  const applyTimeBtn = $('applyTime');
  const cancelTimeBtn = $('cancelTime');

  if (!timePickerBtn || !timePicker) return;

  // Toggle time picker with instant display
  timePickerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isVisible = timePicker.style.display === 'block';
    if (isVisible) {
      timePicker.style.display = 'none';
    } else {
      timePicker.style.display = 'block';
      timePicker.style.opacity = '1';
    }
  });

  // Apply time from picker
  applyTimeBtn?.addEventListener('click', () => {
    const hours = parseInt(hoursPicker.value) || 0;
    const minutes = parseInt(minutesPicker.value) || 0;
    const seconds = parseInt(secondsPicker.value) || 0;
    
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    hourInput.value = timeStr;
    timePicker.style.display = 'none';
    validateWorkReportForm();
  });

  // Cancel time picker
  cancelTimeBtn?.addEventListener('click', () => {
    timePicker.style.display = 'none';
  });

  // Close time picker when clicking outside
  document.addEventListener('click', (e) => {
    if (timePicker && !timePicker.contains(e.target) && !timePickerBtn.contains(e.target)) {
      timePicker.style.display = 'none';
    }
  });
}

// Form validation for work report
function validateWorkReportForm() {
  if (!hourInput || !hourCatSel || !btnHourSubmit) return;
  
  const input = (hourInput.value || '').trim();
  const category = hourCatSel.value || '';
  const isTimeValid = /^\d{1,2}:\d{2}(:\d{2})?$/.test(input);
  const isCategorySelected = category !== '';
  
  btnHourSubmit.disabled = !(isTimeValid && isCategorySelected);
}

/* -------- Copyright Report modal: RESULT first, conditional CATEGORY -------- */
let copyModal, copyCatSel, copyNotes, btnCopySubmit, copyTitle, btnCopyYes, btnCopyNo;
let copySelectedStatus = ''; // 'issues_found' or 'no_issues'
(function ensureCopyrightModal(){
  copyModal = $('copyModal');
  if(!copyModal){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div id="copyModal" class="modal">
      <div class="modal-card">
        <h3 id="copyTitle">Copyright Check Report</h3>

        <label style="display:block;margin-top:6px;">Result</label>
        <div style="display:flex;gap:8px;margin:6px 0 8px;">
          <button id="btnCopyYes" class="btn" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;">Yes</button>
          <button id="btnCopyNo"  class="btn" style="background:linear-gradient(135deg,#475569,#94a3b8);color:#fff;">No</button>
        </div>

        <div id="copyCatWrap" style="display:none;">
          <label style="display:block;margin-top:6px;">Category</label>
          <!-- FORCED BLACK TEXT + WHITE BG -->
          <select id="copyCategory" class="field"
                  style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:#000">
            <option value="">— Select —</option>
            <option value="visual">Visual</option>
            <option value="audio">Audio</option>
            <option value="visual_audio">Visual + Audio</option>
          </select>
        </div>

        <label style="display:block;margin-top:10px;">Notes (optional)</label>
        <textarea id="copyNotes" class="field" rows="3" placeholder="Any details to share…"></textarea>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button id="btnCopySubmit" class="btn" style="background:linear-gradient(135deg,#4f46e5,#3aed);color:#fff;">Submit</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap);
  }
  copyModal = $('copyModal');
  copyCatSel = $('copyCategory');
  copyNotes = $('copyNotes');
  btnCopySubmit = $('btnCopySubmit');
  copyTitle = $('copyTitle');
  btnCopyYes = $('btnCopyYes');
  btnCopyNo  = $('btnCopyNo');

  // Toggle helpers
  const catWrap = document.getElementById('copyCatWrap');
  const activate = (yes) => {
    copySelectedStatus = yes ? 'issues_found' : 'no_issues';
    if (catWrap) catWrap.style.display = yes ? 'block' : 'none'; // show category only when "Yes"
    if (!yes && copyCatSel) copyCatSel.value = '';
    btnCopyYes.style.filter = yes ? 'saturate(1.1) brightness(1.05)' : 'none';
    btnCopyNo.style.filter  = !yes ? 'saturate(1.1) brightness(1.05)' : 'none';
  };
  btnCopyYes?.addEventListener('click', (e)=>{ e.preventDefault(); activate(true); });
  btnCopyNo?.addEventListener('click',  (e)=>{ e.preventDefault(); activate(false); });
})();

/* ------------------ State ------------------ */
let current = null;     // {type, startMs, tick, hourStartMs, nextHourAt, hourModalOpen, breakTimer, breakReminder, __firstBreakReminderTimeout, endsAtMs?, _inactivityReminderInterval, _hourGraceTimer, _hourReminderInterval}
let lastUser = null;
/* >>> ADDED: exiting flag + centralized quitter <<< */
let __exitingNow = false;

async function finishAndQuit() {
  __exitingNow = true;
  try { await endDayAndLogout(); } catch (_) {}
  try {
    if (window.eTimer?.quit) {
      await window.eTimer.quit();
    } else if (window.native?.closeWindow) {
      await window.native.closeWindow();
    } else {
      window.close();
    }
  } catch(_) {}
}
 /* <<< /ADDED */

let lunchTriggeredDay = '';
window.__hardCapRemainSec = null;
let attendancePing = null;
let autoBreakActive = false;
let totalsUnsub = null;
let productivityUnsub = null; // unsubscribe for productivity listener
let productivityChart = null; // productivity comparison chart instance

// lunch skip approval live notice (per day)
let lunchApprovalListenerUnsub = null;
let lastSeenLunchApprovalStatus = null;
// early-exit approval listener unsub
let _earlyExitUnsub = null;

/* ===================== NEW: Active-session persistence ===================== */
const ACTIVE_SESSIONS = 'activeSessions'; // Firestore collection to keep the running session

// ---------- REPLACED: more robust saveActiveSession + clearActiveSession ----------
async function saveActiveSession(type, startMs, opts = {}) {
  if (!lastUser) {
    console.warn('saveActiveSession: no lastUser, skipping save', { type, startMs });
    return;
  }
  try {
    const startMsNum = Number(startMs) || Date.now();
    const endsAtMs = (opts && (opts.endsAtMs ?? null)) || null;

    const payload = {
      userId: lastUser.uid,
      type: String(type || '').toLowerCase(),
      startMs: startMsNum,
      endsAtMs: endsAtMs,
      ymdStart: ymd(new Date(startMsNum)),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, ACTIVE_SESSIONS, lastUser.uid), payload, { merge: true });
    console.log('saveActiveSession: wrote activeSessions/', lastUser.uid, payload);
  } catch (err) {
    console.error('saveActiveSession: failed to write activeSessions doc', err, { uid: lastUser?.uid, type, startMs });
  }
}

async function clearActiveSession() {
  if (!lastUser) {
    console.warn('clearActiveSession: no lastUser, cannot delete activeSessions doc');
    return;
  }
  try {
    await deleteDoc(doc(db, ACTIVE_SESSIONS, lastUser.uid));
    console.log('clearActiveSession: deleted activeSessions/', lastUser.uid);
  } catch (err) {
    console.error('clearActiveSession: failed to delete activeSessions doc', err, { uid: lastUser.uid });
  }
}
// ------------------------------------------------------------------------------

/** If a stored session started yesterday, write yesterday’s portion and continue from 00:00 today. */
async function normalizeForMidnight(active) {
  if (!active) return null;
  const { type, startMs, endsAtMs } = active;
  const now = Date.now();
  const startDay = ymd(new Date(startMs));
  const today = ymd(new Date());
  if (startDay === today) return { type, startMs, endsAtMs };

  // Split at midnight
  const midnight = new Date(); midnight.setHours(0,0,0,0);
  const today0 = midnight.getTime();
  const yesterdayEnd = today0 - 1;
  const ended = Math.min(endsAtMs ?? now, yesterdayEnd);
  if (ended > startMs) {
    const durationYesterday = Math.max(1, Math.round((ended - startMs) / 1000));
    try { await writeDualLogs(type, durationYesterday, startMs); } catch {}
  }

  if (endsAtMs && endsAtMs <= today0) {
    await clearActiveSession();
    return null;
  }

  const newStart = today0;
  await saveActiveSession(type, newStart, { endsAtMs });
  return { type, startMs: newStart, endsAtMs };
}

/** On login/app start: resume the active session if present. */
async function resumeActiveSessionIfAny() {
  if (!lastUser) return;
  try {
    const s = await getDoc(doc(db, ACTIVE_SESSIONS, lastUser.uid));
    if (!s.exists()) return;
    let active = s.data();

    active = await normalizeForMidnight(active);
    if (!active) return;

    const now = Date.now();

    if (active.endsAtMs && now >= active.endsAtMs) {
      const dur = Math.max(1, Math.round((active.endsAtMs - active.startMs) / 1000));
      try { await writeDualLogs(active.type, dur, active.startMs); } catch {}
      await clearActiveSession();
      await Promise.all([loadTotals(), loadWeekly(), loadLogs()]);
      return;
    }

    startTick(active.type, active.startMs, active.endsAtMs);
  } catch (e) {
    console.warn('resumeActiveSessionIfAny failed', e);
  }
}
/* ========================================================================== */

/* ------------------ Auth ------------------ */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ window.location.href = './login.html'; return; }
  lastUser = user;

  try {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid, email: user.email || '',
      displayName: user.displayName || '', photoURL: user.photoURL || '',
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) { console.warn('users upsert failed', e); }

  profileName && (profileName.textContent = user.displayName || 'User');
  if (avatar) {
    avatar.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="pfp">`
      : `<span>${(lastUser.displayName||'U').slice(0,1).toUpperCase()}</span>`;
  }
  
  // Update compact profile section
  const userPhoto = document.getElementById('userPhoto');
  if (userPhoto) {
    userPhoto.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="User Photo">`
      : `<span>${(user.displayName||'U').slice(0,1).toUpperCase()}</span>`;
  }
  
  const userName = document.getElementById('userName');
  if (userName) {
    userName.textContent = user.displayName || 'User';
  }
  
  const greetingText = document.getElementById('greetingText');
  if (greetingText) {
    greetingText.innerHTML = `Hey, <span id="userName">${user.displayName || 'User'}</span> 👋`;
  }
  
  // Update profile section using global function
  if (typeof window.updateUserProfile === 'function') {
    window.updateUserProfile(user);
  }
  
  // Update UserProfileManager if available
  if (window.userProfileManager) {
    window.userProfileManager.updateFromFirebase();
  }

  await ensureAttendanceLogin();
  startAttendancePing();
  listenLunchSkipApprovalsToday();

  // ===== NEW: start listening for break approvals for this user =====
  try { listenForBreakApprovals(); } catch(e){ console.warn('listenForBreakApprovals init failed', e); }
  
  // ===== NEW: start listening for exit request responses =====
  try { listenForExitRequestResponses(); } catch(e){ console.warn('listenForExitRequestResponses init failed', e); }

  /* ===== NEW: resume running session if the app was closed ===== */
  await resumeActiveSessionIfAny();

  await loadLogs(); await loadWeekly(); await loadTotals();
  
  // Initialize productivity listener and chart with delay to ensure DOM is ready
  setTimeout(() => {
    try{ 
      listenProductivityForUser(); 
      console.log('Productivity listener initialized for user:', lastUser.uid);
    }catch(e){ 
      console.warn('listenProductivityForUser init failed', e); 
    }
    
    try {
      // Initialize the new productivity comparison chart
      if (window.initProductivityChart) {
        window.initProductivityChart();
        console.log('Productivity comparison chart initialized for user:', lastUser.uid);
      } else {
        console.warn('ProductivityChart module not loaded yet, retrying...');
        setTimeout(() => {
          if (window.initProductivityChart) {
            window.initProductivityChart();
          }
        }, 2000);
      }
    } catch(e) {
      console.warn('initProductivityChart failed', e);
    }
  }, 1000);
  
  listenMeetingBroadcast();
});

/* ------------------ Helpers ------------------ */
function show(m){ m?.classList?.add('show'); }
function hide(m){ m?.classList?.remove('show'); }
function fmt(sec){ sec=Number(sec)||0; const h=String(Math.floor(sec/3600)).padStart(2,'0'); const m=String(Math.floor((sec%3600)/60)).padStart(2,'0'); const s=String(Math.floor(sec%60)).padStart(2,'0'); return `${h}:${m}:${s}`; }
function ymd(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
/* Strict mm:ss or hh:mm:ss for work reports */
function parseMmSsStrict(str=''){
  const t = String(str).trim();
  if(!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return NaN;
  const parts = t.split(':').map(n=>Number(n));
  if(parts.length === 2) return Math.round(parts[0]*60 + parts[1]);
  return Math.round(parts[0]*3600 + parts[1]*60 + parts[2]);
}
function msToLocal(ms){ try{ return new Date(ms).toLocaleString(); }catch{ return ''; } }

/* -------- Slack helpers: proxy + Google-Sheets-like tables ---------- */
function getProxyUrl(){ const saved = localStorage.getItem('SLACK_PROXY_URL'); return (saved && saved.trim()) ? saved.trim() : DEFAULT_PROXY; }
async function postSlack(text){
  const proxy = getProxyUrl();
  const payload = { text };
  // Try a normal fetch first (so we can observe result & CORS errors). Fall back to no-cors when needed.
  try{
    const res = await fetch(proxy, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      console.warn('postSlack responded non-ok', res.status, await res.text().catch(()=>'<no-body>'));
    }
    return;
  }catch(e){
    // fallback to no-cors (best-effort; may not report success)
    try{
      await fetch(proxy, { method:'POST', mode:'no-cors', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      try{ await fetch(`${proxy}&text=${encodeURIComponent(text)}`, { mode:'no-cors' }); }catch(_){}
      return;
    }catch(err){
      console.warn('postSlack both tries failed', err);
    }
  }
}

/* ---------- New: send Block Kit blocks via your existing Apps Script proxy ----------
   Uses the same proxy URL logic as postSlack(); posts JSON with { blocks } so proxy forwards
   the Block Kit payload to Slack webhook. Falls back to mode:'no-cors' if needed.
*/
async function sendSlackBlocksViaProxy(blocks) {
  const proxy = (typeof getProxyUrl === 'function') ? getProxyUrl() : (typeof PROXY_BASE !== 'undefined' ? DEFAULT_PROXY : null);
  if (!proxy) {
    console.warn('sendSlackBlocksViaProxy: no proxy configured');
    return;
  }
  const payload = { blocks };
  try {
    const res = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      console.warn('sendSlackBlocksViaProxy non-ok', res.status, await res.text().catch(()=>'<no body>'));
    }
    return;
  } catch (firstErr) {
    try {
      await fetch(proxy, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      try { await fetch(proxy + '&blocks=' + encodeURIComponent(JSON.stringify(blocks)), { mode: 'no-cors' }); } catch (_) {}
      return;
    } catch (err) {
      console.warn('sendSlackBlocksViaProxy both tries failed', err, firstErr);
    }
  }
}



/* Boxed (sheet-like) monospace table inside a Slack code block */
function boxedTable(headers, rows){
  if (!Array.isArray(headers) || headers.length === 0) {
    return '```\n(no data)\n```';
  }

  const normalizedRows = Array.isArray(rows) ? rows : [];
  const all = [headers, ...normalizedRows];
  const widths = headers.map((_, i) => Math.max(...all.map(r => String(r?.[i] ?? '').length)));
  const padCell = (value, idx) => String(value ?? '').padEnd(widths[idx], ' ');
  const makeLine = (left, middle, right, fill) => left + widths.map(w => fill.repeat(w + 2)).join(middle) + right;
  const formatRow = (cells) => '| ' + widths.map((_, idx) => padCell(cells?.[idx] ?? '', idx)).join(' | ') + ' |';

  const top = makeLine('+', '+', '+', '-');
  const header = formatRow(headers);
  const mid = makeLine('+', '+', '+', '-');
  const body = normalizedRows.length ? normalizedRows.map(formatRow).join('\n') : formatRow(widths.map(() => ''));
  const bottom = makeLine('+', '+', '+', '-');

  return '```\n' + top + '\n' + header + '\n' + mid + '\n' + body + '\n' + bottom + '\n```';
}

function niceCat(cat){
  if(!cat) return '—';
  if(cat === 'visual_audio') return 'Visual + Audio';
  return cat.replace(/_/g,' ').replace(/\b\w/g, m=>m.toUpperCase());
}

/* Tabled Work Report */

/* Replaced Work Report Slack sender with Block Kit table-style message (visually aligned) */

/* ---------- Replaced Work Hourly Report sender: Markdown-style simple report ---------- */

/* ---------- Replaced Work Hourly Report sender: Block Kit table-style message ---------- */
async function postHourlyReportToSlack({hStart, hEnd, reportedSec, category}){
  try{
    const name = userDisplay();
    const timeRange = `${toLocalDateTime(hStart)} → ${toLocalDateTime(hEnd)}`;
    const columns = ['Name', 'Time (Start → End)', 'Category', 'Focused Work'];
    const values  = [name, timeRange, niceCat(category||''), fmt(reportedSec)];

    const fields = columns.map((h, idx) => ({ type: 'mrkdwn', text: `*${h}*\n${values[idx] ?? ''}` }));

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `📝 ${userDisplay()} Work Report`, emoji: true } },
      { type: 'divider' },
      { type: 'section', fields },
      { type: 'context', elements: [ { type: 'mrkdwn', text: `_Recorded: ${toLocalDateTime(Date.now())}_` } ] }
    ];

    await sendSlackBlocksViaProxy(blocks);
  }catch(err){
    console.warn('postHourlyReportToSlack Block Kit failed, falling back to markdown', err);
    try{
      const textLines = [];
      textLines.push('*📝 Work Report*');
      textLines.push(`*Name:* ${userDisplay()}`);
      textLines.push(`*Time:* ${timeRange}`);
      textLines.push(`*Category:* ${niceCat(category||'')}`);
      textLines.push(`*Focused Work:* ${fmt(reportedSec)}`);
      const payloadText = textLines.join('\n');
      if(typeof postSlack === 'function'){
        await postSlack(payloadText);
      } else if (typeof SLACK_WEBHOOK !== 'undefined'){
        await fetch(SLACK_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: payloadText }) });
      }
    }catch(e){ console.error('postHourlyReportToSlack fallback failed', e); }
  }
}




/* Simple notices stay plain */
async function postNoticeToSlack(title, body){
  const name = userDisplay();
  await postSlack(`*${title}* — ${name}\n${body}`);
}

/* Tabled Copyright Report */
async function postCopyrightToSlack({hStart, hEnd, durationSec, category, status, notes}){
  const name = userDisplay();
  const table = boxedTable(
    ['Name','Time (Start → End)','Result','Category','Duration','Notes'],
    [[
      name,
      `${toLocalDateTime(hStart)} → ${toLocalDateTime(hEnd)}`,
      status === 'issues_found' ? 'Issues found' : 'No issues',
      status === 'issues_found' ? niceCat(category) : '—',
      fmt(durationSec),
      (notes || '—').slice(0,80)
    ]]
  );
  await postSlack(`*Copyright Check*\n${table}`);
}

/* -------- limits helpers -------- */
async function getTodaySeconds(type){
  const today = ymd(new Date());
  const snap = await getDocs(
    query(
      collection(db,'userTimeLogs', lastUser.uid, 'logs'),
      where('type','==', type),
      where('ymd','==', today)
    )
  );
  let total = 0; snap.forEach(d => total += Number(d.data().duration)||0);
  return total;
}
async function getUserLimitMinutes(type){
  try{
    const ref = doc(db,'limits', lastUser.uid);
    const docSnap = await getDoc(ref);
    if(!docSnap.exists()) return null;
    const data = docSnap.data();
    if(type==='break') return Number(data.breakDailyMin)||null;
    if(type==='smm')   return Number(data.smmDailyMin)||null;
    return null;
  }catch{ return null; }
}

/* ------------------ Attendance helpers ------------------ */
/* NEW: small helpers to store and retrieve today’s history doc id so we can PAIR login+logout */
function attHistKey(uid, day){ return `attHist_${uid}_${day}`; }

async function ensureAttendanceLogin(){
  if(!lastUser) return;
  const todayStr = ymd(new Date());
  const key = `${lastUser.uid}_${todayStr}`;
  const ref = doc(db, 'attendance', key);
  try {
    // update the main doc (used by main table)
    await setDoc(ref, {
      uid: lastUser.uid,
      ymd: todayStr,
      loginAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    }, { merge: true });

    // ✅ also append/prepare a HISTORY item and remember its id (for pairing with logout)
    const histRef = await addDoc(collection(db, 'attendance', key, 'history'), {
      loginAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    try { localStorage.setItem(attHistKey(lastUser.uid, todayStr), histRef.id); } catch(_){}
  } catch (e) {
    console.error('attendance setDoc(login) failed', e);
  }
}
function startAttendancePing(){
  if(attendancePing) clearInterval(attendancePing);
  attendancePing = setInterval(async ()=>{
    try{
      const key = `${lastUser.uid}_${ymd(new Date())}`;
      const ref = doc(db,'attendance', key);
      try { await updateDoc(ref, { lastSeen: serverTimestamp() }); }
      catch { await setDoc(ref, { uid:lastUser.uid, ymd: ymd(new Date()), lastSeen: serverTimestamp() }, { merge:true }); }
    }catch(e){}
  }, 30000);
}
async function markAttendanceLogout(){
  if(!lastUser) return;
  const todayStr = ymd(new Date());
  const key = `${lastUser.uid}_${todayStr}`;
  const ref = doc(db, 'attendance', key);
  try {
    let totalMs = null;
    try {
      const s = await getDoc(ref);
      if (s.exists()) {
        const dataS = s.data() || {};
        const loginAt = dataS.loginAt;
        const loginMs = loginAt?.toMillis ? loginAt.toMillis()
                     : loginAt ? new Date(loginAt).getTime()
                     : null;
        // compute session ms from login -> now
        if (loginMs) {
          const sessionMs = Math.max(0, Date.now() - loginMs);
          const prevTotal = Number(dataS.totalMs) || 0;
          totalMs = prevTotal + sessionMs;
        } else {
          // no login timestamp — preserve previously accumulated totalMs if present
          totalMs = Number(dataS.totalMs) || null;
        }
      }
    } catch(_) {}

    // update the main doc (used by main table)
    await setDoc(ref, { uid: lastUser.uid, ymd: todayStr, logoutAt: serverTimestamp(), lastSeen: serverTimestamp(), totalMs }, { merge:true });

    // ✅ complete the HISTORY row we started at login (or create a fallback logout row)
    const savedId = (()=>{ try{ return localStorage.getItem(attHistKey(lastUser.uid, todayStr)); }catch(_){ return null; }})();
    if (savedId) {
      try {
        await setDoc(doc(db, 'attendance', key, 'history', savedId), {
          logoutAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch {
        // fallback: at least append a logout event
        await addDoc(collection(db, 'attendance', key, 'history'), {
          logoutAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    } else {
      // no saved login item found — append logout-only entry
      await addDoc(collection(db, 'attendance', key, 'history'), {
        logoutAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    }
  } catch (e) { console.error('attendance logout failed', e); }
}

/* ------------------ Exit Request Response Listener ------------------ */
let _exitRequestUnsub = null;
function listenForExitRequestResponses(){
  try{
    if(_exitRequestUnsub) return;
    if(!lastUser) return;
    
    const q = query(
      collection(db,'notifications'),
      where('userId','==', lastUser.uid),
      where('type','in', ['exit_approved', 'exit_rejected']),
      where('read','==', false)
    );
    
    _exitRequestUnsub = safeOnSnapshot(q, (snap)=>{
      snap.forEach(async (d)=>{
        const notification = d.data();
        const message = notification.message || '';
        const type = notification.type;
        
        // Show notification to user
        showDesktopPopup(
          type === 'exit_approved' ? 'Exit Approved' : 'Exit Rejected', 
          message
        );
        
        // Mark notification as read
        try {
          await updateDoc(doc(db, 'notifications', d.id), { read: true });
        } catch(e) { console.warn('Failed to mark notification as read', e); }
        
        // If approved, close the session
        if (type === 'exit_approved') {
          try {
            await stopAndSave();
            await finishAndQuit();
          } catch(e) {
            console.warn('Failed to close session after approval', e);
          }
        }
      });
    });
  }catch(e){
    console.warn('listenForExitRequestResponses failed', e);
  }
}

/* ------------------ Break-approval helpers (ADDED) ------------------ */
/* Local key used to block further breaks for a user/day until admin approves. */
function _breakApprovalKey(uid, day){ return `breakReq_${uid}_${day}`; }
function markBreakRequiresApprovalForToday(){
  try{ const key = _breakApprovalKey(lastUser.uid, ymd(new Date())); localStorage.setItem(key, '1'); }catch(e){}
}
function clearBreakRequiresApprovalForToday(){
  try{ const key = _breakApprovalKey(lastUser.uid, ymd(new Date())); localStorage.removeItem(key); }catch(e){}
}
function breakRequiresApprovalForToday(){
  try{ const key = _breakApprovalKey(lastUser.uid, ymd(new Date())); return !!localStorage.getItem(key); }catch(e){ return false; }
}

/* Check remote approvals to avoid duplicate requests */
async function hasPendingBreakApprovalToday(){
  if(!lastUser) return false;
  try{
    const today = ymd(new Date());
    const q = query(
      collection(db,'approvals'),
      where('userId','==', lastUser.uid),
      where('type','==','break-request'),
      where('ymd','==', today),
      where('status','==','pending')
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }catch(e){
    console.warn('hasPendingBreakApprovalToday failed', e);
    return false;
  }
}

/* Create an approvals doc for break-request */
async function requestBreakApproval(reason){
  if(!lastUser) return;
  const today = ymd(new Date());
  try{
    await addDoc(collection(db,'approvals'), {
      userId: lastUser.uid,
      type: 'break-request',
      reason: reason || 'Request to take additional break for today',
      status: 'pending',
      ymd: today,
      createdAt: serverTimestamp()
    });
    showDesktopPopup('Break approval requested', 'Your request has been sent to admin.');
    alert('Break approval requested. Admin will need to approve before you can take another break.');
  }catch(e){
    console.error('requestBreakApproval failed', e);
    alert('Failed to send break request. Try again.');
  }
}

/* Listen for admin response to break requests for this user (per day) */
let _breakApprovalUnsub = null;
function listenForBreakApprovals(){
  try{
    if(_breakApprovalUnsub) return;
    if(!lastUser) return;
    const today = ymd(new Date());
    const q = query(
      collection(db,'approvals'),
      where('userId','==', lastUser.uid),
      where('type','==','break-request'),
      where('ymd','==', today)
    );
  _breakApprovalUnsub = safeOnSnapshot(q, (snap)=>{
      snap.forEach(d=>{
        const s = (d.data()?.status || '').toLowerCase();
        if(s === 'approved'){
          clearBreakRequiresApprovalForToday();
          showDesktopPopup('Break Approved', 'Admin approved your request. You may take a break now.');
          alert('Break request approved — you can take a break now.');
        } else if (s === 'rejected' || s === 'denied') {
          // optional: inform user of rejection
          showDesktopPopup('Break Request Denied', 'Admin denied your break request.');
          alert('Break request denied by admin.');
        }
      });
    });
  }catch(e){
    console.warn('listenForBreakApprovals failed', e);
  }
}

/* ------------------ Lunch-skip approval notify ------------------ */
function listenLunchSkipApprovalsToday(){
  if(!lastUser) return;
  if (lunchApprovalListenerUnsub) { lunchApprovalListenerUnsub(); lunchApprovalListenerUnsub = null; }
  const today = ymd(new Date());
  const qApp = query(
    collection(db,'approvals'),
    where('userId','==', lastUser.uid),
    where('ymd','==', today),
    where('type','==','lunch-skip')
  );
  lunchApprovalListenerUnsub = safeOnSnapshot(qApp, (snap)=>{
    snap.forEach(d=>{
      const st = (d.data()?.status || '').toLowerCase();
      if (!st) return;
      if (st !== lastSeenLunchApprovalStatus) {
        lastSeenLunchApprovalStatus = st;
        if (st === 'approved') {
          showDesktopPopup('Lunch Skip Approved', 'Your request to skip lunch was approved.');
          postNoticeToSlack('Lunch Skip Approved', 'User notified on desktop.');
        } else if (st === 'rejected') {
          showDesktopPopup('Lunch Skip Rejected', 'Your lunch skip request was rejected.');
          postNoticeToSlack('Lunch Skip Rejected', 'User notified on desktop.');
        }
      }
    });
  });
}

/* ------------------ Auto-idle → Break (5 minutes) ------------------ */
/* Behavior implemented:
   - After 5 minutes idle while in WORK:
       * compute last active timestamp (= now - idleSec*1000)
       * persist work up to lastActiveMs (writeDualLogs)
       * stop current tick and start a BREAK (auto saved)
       * show notification + openWorkReport immediately
       * if user does not submit report, reminders every 2 minutes (desktop + Slack)
       * on submit: prompt disposition (Work / Break)
*/
async function systemIdleSeconds(){
  try{ if (ET?.systemIdleSeconds) return Number(await ET.systemIdleSeconds())||0; }catch{}
  return 0;
}

let inactivityTriggered = false; // local guard
setInterval(async ()=>{
  if(!lastUser) return;
  const idleSec = await systemIdleSeconds();

  // Only trigger when actively in 'work' segment
  if(current && current.type==='work' && idleSec >= 300 && !inactivityTriggered){
    inactivityTriggered = true;

    // ===== PATCH: include the idle-grace (5 min) in the work segment =====
    // compute effective work duration: include the idle grace so work = start -> now
    const effectiveStart = current.startMs || Date.now();
    const effectiveSec = Math.max(0, Math.round((Date.now() - effectiveStart) / 1000));

    try{
      if(effectiveSec > 0){
        // persist entire work span up to detection moment (includes the idle grace)
        await writeDualLogs('work', effectiveSec, effectiveStart);
      }
    }catch(e){
      console.warn('Failed to persist work (including idle grace) before auto-break', e);
    }
// Immediately stop current work timer and start break (auto break saved via active session logic)
    try{
      stopTick(); // stop UI tick locally
    }catch(e){ console.warn('stopTick failed before auto break', e); }

    try{
      startTick('break');
      autoBreakActive = true;
    }catch(e){ console.warn('startTick break failed', e); }

    // Show immediate notification, and open work report (user can later adjust via report)
    showDesktopPopup("Inactivity Detected", "You were inactive for 5 minutes. Please fill your work segment report.");
    postNoticeToSlack("Inactivity Detected", "User became inactive for 5 minutes — asking for work segment report.");

    // Open work report. For inactivity flow we DO NOT auto-write dual logs again inside openWorkReport
    // because we already wrote the work portion above. But we keep openWorkReport reminders active.
    await openWorkReport({
      title: 'Work Segment Report',
      desc: 'You were inactive for 5 minutes. Please fill your work segment report.',
      hStart: effectiveStart,
      hEnd: Date.now(),
      remindersEverySec: 120,      // remind every 2 minutes
      isInactivityReport: true,
      onAfterSubmit: async (reportObj)=>{
        // clear guard and show disposition popup
        inactivityTriggered = false;
        try {
          // Ask user whether they want to switch back to Work or continue Break
          const wantsWork = confirm("Do you want to switch to work or continue with break?\n\nPress OK to switch to WORK, Cancel to continue with BREAK.");
          if(wantsWork){
            // Stop break and start work fresh
            // If currently still break (we started it above), stop save and start work
            if(current && current.type === 'break'){
              await stopAndSave();
            }
            startTick('work');
            autoBreakActive = false;
          } else {
            // keep break running - ensure it's recorded and timers remain
            // nothing else required (break already running)
          }
        } catch(e){ console.warn('inactivity onAfterSubmit disposition handler failed', e); }
      }
    });

    return;
  }

  // Reset guard when user becomes active again or not in work state
  if(idleSec < 300 || !current || current.type !== 'work'){
    inactivityTriggered = false;
  }
}, 10000); // check every 10s

/* ------------------ Lunch at 2:30 (renderer-side light notice only) ------------------ */
setInterval(async ()=>{
  if(!lastUser) return;
  const now = new Date(); const day = ymd(now);
  if(lunchTriggeredDay === day) return;
  const hh=now.getHours(), mm=now.getMinutes();
  if(hh===14 && mm===30){
    // Keep a local desktop notification for visibility, but DO NOT auto-start lunch or post to Slack here.
    // The main process will emit an IPC ('lunch:popup') and post the Slack message. The renderer
    // lunch-scheduler listens for the IPC and shows a popup with Dismiss / Lunch buttons that reuse
    // the existing lunch logic when the user clicks 'Lunch'. This avoids duplicate Slack posts and
    // accidental auto-starts.
    showDesktopPopup("Lunch Time", "It's 2:30 PM. Start 30-min lunch or continue working.");
    lunchTriggeredDay = day;
  }
}, 60000);

/* ===== NEW: Midnight checker (splits running session when day changes) ===== */
let _lastYMD = ymd(new Date());
setInterval(async ()=>{
  if (!lastUser) return;
  const today = ymd(new Date());
  if (today !== _lastYMD) {
    _lastYMD = today;
    try {
      const s = await getDoc(doc(db, ACTIVE_SESSIONS, lastUser.uid));
      if (s.exists()) {
        await normalizeForMidnight(s.data());
        await Promise.all([loadTotals(), loadWeekly(), loadLogs()]);
        setTimeout(() => {
          try{ listenProductivityForUser(); }catch(e){ console.warn('midnight productivity listener restart failed', e); }
        }, 200);
      } else {
        await Promise.all([loadTotals(), loadWeekly(), loadLogs()]);
        setTimeout(() => {
          try{ listenProductivityForUser(); }catch(e){ console.warn('midnight productivity listener restart failed', e); }
        }, 200);
      }
    } catch {}
  }
}, 60000);
/* ========================================================================== */

/* ------------------ Meeting broadcast (auto switch) ------------------ */
function listenMeetingBroadcast(){
  const qSig = query(collection(db,'signals'), orderBy('at','desc'), limit(1));
  safeOnSnapshot(qSig, async (snap)=>{
    const docSig = snap.docs[0]; if(!docSig) return;
    const x = docSig.data();
    if(x.kind === 'meeting'){
      if(x.action === 'start'){
        if(current){
          if(current.type==='work'){
            const hStart=current.startMs, hEnd=Date.now();
            await openWorkReport({
              title:'Work Segment Report',
              desc:'Before meeting, record focused time for this work segment.',
              hStart, hEnd,
              onAfterSubmit: async ()=> { await stopAndSave(); startTick('meeting'); }
            });
          } else if(current.type==='copyright'){
            const cStart=current.startMs, cEnd=Date.now();
            await openCopyrightReport({
              cStart, cEnd,
              onAfterSubmit: async ()=> { await stopAndSave(); startTick('meeting'); }
            });
          } else { await stopAndSave(); startTick('meeting'); }
        } else { startTick('meeting'); }
      } else if(x.action === 'stop'){
        if(current && current.type==='meeting'){ await stopAndSave(); }
      }
    }
  });
}

/* ------------------ Ticker + Floating ------------------ */
function startTick(type, presetStartMs = null, presetEndsAtMs = null){
  stopTick();
  const startMs = presetStartMs ?? Date.now();
  current = {
    type, startMs,
    tick:null, hourStartMs:null, nextHourAt:null, hourModalOpen:false,
    breakTimer:null, breakReminder:null,
    endsAtMs: presetEndsAtMs ?? null,
    _inactivityReminderInterval: null,
    _hourGraceTimer: null,
    _hourReminderInterval: null,
    __firstBreakReminderTimeout: null
  };

  // Persist active session immediately (and set a cap for break/lunch if not provided)
  const capMs = (type === 'break') ? (startMs + 10*60*1000)
             : null;
  const endsAtMs = presetEndsAtMs ?? capMs;
  saveActiveSession(type, startMs, { endsAtMs });

  liveType && (liveType.textContent = type.toUpperCase());
  if (!window.eTimer && floating) floating.style.display='flex';
  ftType && (ftType.textContent = type.toUpperCase());
  if (emgWrap) emgWrap.style.display = (['work','meeting','smm','activity','copyright'].includes(type)) ? 'block' : 'none';
  
  // Update timer colors based on activity type
  updateTimerColors(type);
  
  ovShow(type, 0);

  // Break reminders
  if (type === 'break') {
    if (current.breakReminder) clearInterval(current.breakReminder);
    const firstTimeout = setTimeout(() => {
      showDesktopPopup("Break Reminder", "You’ve been on break for 10 minutes.");
      postNoticeToSlack("Break Reminder", "Break has been running for 10 minutes.");
      current.breakReminder = setInterval(() => {
        showDesktopPopup("Break Reminder", "You’re still on break. Click Work to resume.");
        postNoticeToSlack("Break Reminder", "Still on break. Reminder every 5 minutes until Work resumes.");
      }, 5*60*1000);
    }, 10*60*1000);
    current.__firstBreakReminderTimeout = firstTimeout;
  }

  /* ==== UPDATED: Copyright reminders (10 min first, then every 5 min; start-aware & includes user name) ==== */
  if (type === 'copyright') {
    if (current.breakReminder) clearInterval(current.breakReminder);
    if (current.__firstBreakReminderTimeout) clearTimeout(current.__firstBreakReminderTimeout);

    const tenMinMs = 10 * 60 * 1000;
    const fiveMinMs = 5 * 60 * 1000;
    const now = Date.now();

    const elapsedMs = Math.max(0, now - startMs);
    const initialDelay = Math.max(0, tenMinMs - elapsedMs);

    const fireFirstCopyrightNotice = () => {
      const uname = userDisplay();
      showDesktopPopup("Copyright Reminder", `${uname} – You are checking copyright for 10 minutes.`);
      postNoticeToSlack("Copyright Reminder", `${uname} has been in Copyright for 10 minutes.`);

      current.breakReminder = setInterval(() => {
        showDesktopPopup("Copyright Reminder", `${uname}, you’re still in Copyright check for last 5 minutes. Click Work to resume.`);
        postNoticeToSlack("Copyright Reminder", `${uname} you’re still in Copyright check for last 5 minutes. If you are done, please switch to Work.`);
      }, fiveMinMs);
    };

    if (initialDelay === 0) {
      fireFirstCopyrightNotice();
    } else {
      current.__firstBreakReminderTimeout = setTimeout(fireFirstCopyrightNotice, initialDelay);
    }
  }
  /* ==== /UPDATED ==== */

  // 1-hour checkpoint for WORK
   // 1-hour checkpoint (configurable) for WORK
  if (type === 'work') {
    current.hourStartMs = startMs;
    current.nextHourAt  = startMs + WORK_REPORT_INTERVAL_SEC * 1000;
    current.hourModalOpen = false;
  }


  current.tick = setInterval(async ()=>{
    if(!current) return;

    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - startMs)/1000));
    liveClock && (liveClock.textContent = fmt(elapsed));
    ftTime && (ftTime.textContent = fmt(elapsed));
    ovUpdate(type, elapsed);
    
    // Update grand total timer
    if (window.userProfileManager && typeof window.userProfileManager.updateGrandTotal === 'function') {
      window.userProfileManager.updateGrandTotal(elapsed);
    }
    
    // Update bar chart animations
    updateBarChartAnimations();

    // End automatically if a hard cap time exists and we crossed it while open
    if (current.endsAtMs && now >= current.endsAtMs) {
      const durationSec = Math.max(1, Math.round((current.endsAtMs - startMs) / 1000));
      try { await writeDualLogs(type, durationSec, startMs); } catch {}
      await clearActiveSession();
      stopTick();
      await Promise.all([loadTotals(), loadWeekly(), loadLogs()]);
      return;
    }

    // Auto checkpoint: DO NOT persist hour chunk until the user explicitly submits the hourly report.
// Replace the existing `if (type === 'work' && !current.hourModalOpen && now >= current.nextHourAt) { ... }`.
// Auto checkpoint: DO NOT persist hour chunk until the user explicitly submits the hourly report.
// Block re-entrancy during an ongoing hourly-confirm flow via __hourlyReportingInProgress flag.
// Auto checkpoint: DO NOT persist hour chunk until the user explicitly submits the hourly report.
// Added guard to prevent re-entry during an ongoing report/confirmation flow.
if (type === 'work' && !current.hourModalOpen && !current.__hourlyReportingInProgress && now >= current.nextHourAt) {
  try {
    // Lock the hourly modal
    current.hourModalOpen = true;

    // Capture boundaries
    const hStart = current.hourStartMs;
    const hEnd = current.nextHourAt;
    const chunkSec = Math.max(0, Math.round((hEnd - hStart) / 1000));

    // Move pointer forward for future windows
    current.hourStartMs = hEnd;
    current.nextHourAt = hEnd + WORK_REPORT_INTERVAL_SEC * 1000;

    // Notify user
    showDesktopPopup("Hourly Report Due", "Please record your last focused work session.");
    postNoticeToSlack("Hourly Report Due", "Prompted user to submit last focused work session.");

    // Reminders every 2 minutes while modal open
    try {
      if (current._hourReminderInterval) {
        clearInterval(current._hourReminderInterval);
        current._hourReminderInterval = null;
      }
      current._hourReminderInterval = setInterval(async () => {
        try {
          const uname = userDisplay();
          showDesktopPopup("Hourly Report Reminder", `${uname} — Please submit your hourly work report.`);
          await postNoticeToSlack("Hourly Report Reminder", "User did not submit hourly report yet.");
        } catch (e) {
          console.warn("hourly reminder failed", e);
        }
      }, 120 * 1000);
    } catch (e) {
      console.warn("startHourlyReminders failed", e);
    }

    // Open report modal (manual-only)
    await openWorkReport({
      title: "1-Hour Productivity",
      desc: "How much focused work did you complete in the last period?",
      hStart,
      hEnd,
      remindersEverySec: 120,
      isHourlyReport: true,

      // ✅ This handler executes when the user SUBMITS the report
      onAfterSubmit: async (reportObj) => {
        try {
          // Mark reporting flow in progress (prevents re-trigger)
          if (current) current.__hourlyReportingInProgress = true;

          // Clear reminders
          try {
            if (current && current._hourReminderInterval) {
              clearInterval(current._hourReminderInterval);
              current._hourReminderInterval = null;
            }
          } catch (_) {}
          if (current) current.hourModalOpen = false;

          // User’s self-reported seconds
          const reportedSec = Number(reportObj.reportedSec || 0) || 0;

          // Delay for report fill (from boundary to submission)
          const reportFillDelayMs = Math.max(0, Date.now() - hEnd);
          const reportFillDelaySec = Math.max(0, Math.round(reportFillDelayMs / 1000));

          // Short delay to ensure modal closes properly (countdown continues)
          await new Promise((res) => setTimeout(res, 150));

          // Show confirmation; measure time taken by user to respond
          const confirmStart = Date.now();
          const wantsWork = confirm("Continue Work? Press OK to continue Work (timer will reset), Cancel to switch to Break.");
          const confirmEnd = Date.now();
          const confirmDelaySec = Math.max(0, Math.round((confirmEnd - confirmStart) / 1000));

          // ⏱ Total seconds to add (only after confirmation)
          const ONE_HOUR_SEC = 600; // 1 hour in seconds
          const totalSec = ONE_HOUR_SEC + reportFillDelaySec + confirmDelaySec;

          // ✅ Persist work time ONLY after confirmation
          if (totalSec > 0) {
            try {
              await writeDualLogs("work", totalSec, hStart);
              console.log("Hourly write saved:", { totalSec, hStart });
            } catch (e) {
              console.warn("writeDualLogs for report failed:", e);
            }
          } else {
            console.log("Hourly report confirmed with zero focused time; skipping write.");
          }

          // Send Slack report after confirmation
          try {
            await postHourlyReportToSlack({
              hStart,
              hEnd,
              reportedSec: reportedSec,
              category: reportObj.category || ""
            });
          } catch (e) {
            console.warn("postHourlyReportToSlack failed", e);
          }

          // Handle user’s choice AFTER confirmation
          if (wantsWork) {
            // Continue Work: restart new timer from 00:00:00
            setTimeout(() => {
              try {
                stopTick();
                startTick("work");
              } catch (e) {
                console.warn("Restart work failed", e);
              }
            }, 50);
          } else {
            // Take Break: stop work and start break
            try {
              await clearActiveSession();
              setTimeout(() => {
                stopTick();
                startTick("break");
              }, 50);
            } catch (e) {
              console.warn("Switch to break failed", e);
            }
          }

          // Allow next hourly report to trigger later
          if (current) current.__hourlyReportingInProgress = false;
        } catch (errOnSubmit) {
          console.warn("hourly onAfterSubmit handler failed", errOnSubmit);
          try {
            if (current) {
              current.hourModalOpen = false;
              current.__hourlyReportingInProgress = false;
            }
          } catch (_) {}
        }
      },

      // Cleanup when modal closed without submission
      onDismiss: () => {
        try {
          if (current && current._hourReminderInterval) {
            clearInterval(current._hourReminderInterval);
            current._hourReminderInterval = null;
          }
          if (current && current._hourGraceTimer) {
            clearTimeout(current._hourGraceTimer);
            current._hourGraceTimer = null;
          }
          if (current) current.hourModalOpen = false;
        } catch (e) {
          console.warn("hourly modal dismiss cleanup failed", e);
        }
      }
    });

    // Return to avoid double tick execution
    return;
  } catch (outerErr) {
    console.warn("Hourly checkpoint handler unexpected error", outerErr);
    try { if (current) current.hourModalOpen = false; } catch (_) {}
  }
}

    // ----- CHANGED: Hard caps by minutes/day: stop break and require approval if exceeded -----
    if((type==='break' || type==='smm') && window.__hardCapRemainSec){
      if(elapsed >= window.__hardCapRemainSec){
        // stop the running segment and persist
        try{
          await stopAndSave();
        }catch(e){ console.warn('stopAndSave during hard cap failed', e); }

        if(type === 'break' && lastUser){
          // mark local lock to prevent starting another break without approval
          markBreakRequiresApprovalForToday();
          try{
            showDesktopPopup('Break limit reached', 'Your break time limit for today has been reached. Request admin approval to take another break.');
            alert('Your break time limit for today has been reached. To take another break you must request admin approval.');
          }catch(e){ console.warn(e); }
        } else {
          try{
            showDesktopPopup(`${type.toUpperCase()} limit reached`, `${type.toUpperCase()} limit for today reached.`);
            alert(`${type.toUpperCase()} limit for today reached.`);
          }catch(e){}
        }

        // clear remaining cap so we don't keep retriggering
        window.__hardCapRemainSec = null;
        return;
      }
    }
    // ------------------------------------------------------------------------------------------

    // Hard caps by minutes/day (older code left for parity if needed)
  }, 1000);
}

function stopTick(){
  if(current?.tick) clearInterval(current.tick);
  if(current?.breakTimer) clearTimeout(current.breakTimer);
  if (current?.breakReminder) clearInterval(current.breakReminder);
  if (current?.__firstBreakReminderTimeout) clearTimeout(current.__firstBreakReminderTimeout);

  // clear any inactivity/hours reminder timers attached to current
  try{
    if(current && current._inactivityReminderInterval) { clearInterval(current._inactivityReminderInterval); current._inactivityReminderInterval = null; }
    if(current && current._hourGraceTimer) { clearTimeout(current._hourGraceTimer); current._hourGraceTimer = null; }
    if(current && current._hourReminderInterval) { clearInterval(current._hourReminderInterval); current._hourReminderInterval = null; }
  }catch(e){ console.warn('Failed to clear auxiliary timers during stopTick', e); }

  current = null;
  if (liveClock) liveClock.textContent = '00:00:00';
  if (liveType)  liveType.textContent  = '—';
  if (ftType)    ftType.textContent    = '—';
  if (ftTime)    ftTime.textContent    = '00:00:00';
  if (floating?.style) floating.style.display='none';
  if (emgWrap) emgWrap.style.display = 'none';
  
  // Reset timer colors to default
  resetTimerColors();
  
  window.__hardCapRemainSec = null;
}

/* ---- Draggable floating (web only) ---- */
(function enableDrag(){
  if (window.eTimer) return;
  if (!floating) return;
  let sx=0, sy=0, ox=0, oy=0, isDown=false;
  const saved = JSON.parse(localStorage.getItem('ft-pos')||'null');
  if(saved){ floating.style.right='auto'; floating.style.bottom='auto'; floating.style.left=saved.x+'px'; floating.style.top=saved.y+'px'; }
  floating.addEventListener('pointerdown', e=>{
    isDown=true; floating.setPointerCapture(e.pointerId);
    const r=floating.getBoundingClientRect(); ox=r.left; oy=r.top; sx=e.clientX; sy=e.clientY;
  });
  window.addEventListener('pointermove', e=>{
    if(!isDown) return;
    const nx = ox + (e.clientX-sx); const ny = oy + (e.clientY-sy);
    floating.style.left = Math.max(8, Math.min(window.innerWidth-248, nx))+'px';
    floating.style.top  = Math.max(8, Math.min(window.innerHeight-86, ny))+'px';
  });
  window.addEventListener('pointerup', ()=>{
    if(!isDown) return; isDown=false;
    const r=floating.getBoundingClientRect();
    localStorage.setItem('ft-pos', JSON.stringify({x:r.left, y:r.top}));
  });
})();

/* ---- Emergency Break ---- */
async function forceBreak(){
  if(!lastUser) return;
  if(current && current.type==='break') return;
  if(current){ await stopAndSave(); }
  startTick('break');
  current.breakTimer = setTimeout(async ()=>{ if(current && current.type==='break'){ await stopAndSave(); } }, 10*60*1000);
}
btnQuickBreak?.addEventListener('click', (e)=>{ e.preventDefault(); forceBreak(); });

/* ------------------ Buttons ------------------ */
// Signout button removed from UI. Provide a no-op replacement so existing flows that
// previously awaited signOut(auth) can still call a harmless function without side-effects.
async function onSignoutRemoved(){
  // intentionally empty: signout functionality removed per requirement
}
btnEditProfile?.addEventListener('click', ()=>{ 
  if(!lastUser) return; 
  if (editName) editName.value = lastUser.displayName || ''; 
  show(editModal); 
  
  // Also update UserProfileManager modal if it exists
  if (window.userProfileManager) {
    const profileNameInput = document.getElementById('profileNameInput');
    const editProfileModal = document.getElementById('editProfileModal');
    if (profileNameInput && editProfileModal) {
      profileNameInput.value = lastUser.displayName || '';
      editProfileModal.classList.add('show');
    }
  }
});
$('btnCancelEdit')?.addEventListener('click', ()=> hide(editModal));
$('btnSaveEdit')?.addEventListener('click', async ()=>{ 
  if(!lastUser) return;
  try{
    await updateProfile(lastUser, { displayName: editName?.value?.trim() || null });
    await setDoc(doc(db, 'users', lastUser.uid), {
      displayName: lastUser.displayName || '', email: lastUser.email || '', photoURL: lastUser.photoURL || '', updatedAt: serverTimestamp()
    }, { merge:true });
    if (profileName) profileName.textContent = lastUser.displayName || 'User';
    if (avatar) avatar.innerHTML = lastUser.photoURL ? `<img src="${lastUser.photoURL}" alt="pfp">` : `<span>${(lastUser.displayName||'U').slice(0,1).toUpperCase()}</span>`;
    hide(editModal);
  }catch(e){ alert('Failed to update profile'); console.error(e); }
});

/* --- Switch-only + REPORT when leaving Work or Copyright --- */
btnWork?.addEventListener('click',   (e)=> { addClickEffect(e.target); updateTimerColors('work'); startOrSwitch('work'); });
btnMeeting?.addEventListener('click',(e)=> { addClickEffect(e.target); updateTimerColors('meeting'); startOrSwitch('meeting'); });
btnLunch?.addEventListener('click',  (e)=> { addClickEffect(e.target); updateTimerColors('lunch'); startOrSwitch('lunch'); });
btnBreak?.addEventListener('click',  (e)=> { addClickEffect(e.target); updateTimerColors('break'); startOrSwitch('break'); });
btnSMM?.addEventListener('click',    (e)=> { addClickEffect(e.target); updateTimerColors('smm'); startOrSwitch('smm'); });
btnActivity?.addEventListener('click',(e)=> { addClickEffect(e.target); updateTimerColors('activity'); startOrSwitch('activity'); });
btnCopy?.addEventListener('click',   (e)=> { addClickEffect(e.target); updateTimerColors('copyright'); startOrSwitch('copyright'); });

/* Add subtle click effect to buttons */
function addClickEffect(button) {
  try {
    if (!button) return;
    
    // Create ripple effect
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
      transform: scale(0);
      animation: ripple 0.3s linear;
      pointer-events: none;
      width: 20px;
      height: 20px;
      left: 50%;
      top: 50%;
      margin-left: -10px;
      margin-top: -10px;
    `;
    
    button.appendChild(ripple);
    
    // Remove ripple after animation
    setTimeout(() => {
      try {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      } catch(e) {}
    }, 300);
  } catch(e) {
    console.warn('Click effect failed:', e);
  }
}

/* Add ripple animation CSS */
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(rippleStyle);

/* ---------- NEW: Day End click uses case-switcher (under/over 9h) ---------- */
btnDayEnd?.addEventListener('click', (e)=> { addClickEffect(e.target); handleDayLogoutClick(); });

let clicking = false;
async function startOrSwitch(nextType){
  if(clicking) return; clicking = true;
  try{
    if(!lastUser) return;

    // ----- CHANGED: limit check for break/smm (ADDED approval flow for break) -----
    if(nextType === 'break' || nextType === 'smm'){
      const limitMin = await getUserLimitMinutes(nextType);
      if(limitMin && limitMin > 0){
        const usedSec = await getTodaySeconds(nextType);
        const remainSec = (limitMin*60) - usedSec;

        // If already exhausted
        if(remainSec <= 0){
          if(nextType === 'break'){
            // If a local block is present, inform user
            if(breakRequiresApprovalForToday()){
              alert('Your break limit is reached and admin approval is required to take another break. Approval pending? Please wait for admin to approve.');
              return;
            }
            // Check remote pending approval to avoid duplicates
            const pending = await hasPendingBreakApprovalToday();
            if(pending){
              markBreakRequiresApprovalForToday();
              alert('You already requested additional break time. Waiting for admin approval.');
              return;
            }

            // Ask user if they want to send a request to admin
            const send = confirm(`Your Break daily limit (${limitMin} min) is already reached. Do you want to request approval from admin to take an additional break?`);
            if(!send) return;
            await requestBreakApproval(`User requests extra break time (limit ${limitMin} min reached).`);
            markBreakRequiresApprovalForToday();
            listenForBreakApprovals();
            return;
          } else {
            alert(`Your ${nextType.toUpperCase()} daily limit (${limitMin} min) is already reached.`);
            return;
          }
        }

        // still have remaining time
        window.__hardCapRemainSec = remainSec;
      } else {
        window.__hardCapRemainSec = null;
      }
    }
    // --------------------------------------------------------------------------------

    if(current && current.type === nextType) return;

    if(current && current.type==='work' && nextType!=='work'){
      const hStart = current.startMs;
      const hEnd = Date.now();
      await openWorkReport({
        title: 'Work Segment Report',
        desc:  'You are switching from Work. Record focused time for this segment.',
        hStart, hEnd,
        remindersEverySec: 120,
        onAfterSubmit: async ()=>{
          await stopAndSave();
          startTick(nextType);
          // removed auto-stop for lunch: lunch should run until user manually switches disposition.
// If you want a reminder (but not auto-stop), you can show a notification here instead.

          if(nextType === 'work') autoBreakActive = false;
        }
      });
      return;
    }

    if(current && current.type==='copyright' && nextType!=='copyright'){
      const cStart = current.startMs;
      const cEnd = Date.now();
      await openCopyrightReport({
        cStart, cEnd,
        onAfterSubmit: async ()=>{
          await stopAndSave();
          startTick(nextType);
        }
      });
      return;
    }

    if(current){ await stopAndSave(); }
    startTick(nextType);

   // removed auto-stop for lunch: lunch should run until user manually switches disposition.
// If you want a reminder (but not auto-stop), you can show a notification here instead.

    if(nextType === 'work'){ autoBreakActive = false; }
  } finally {
    setTimeout(()=>{ clicking = false; }, 300);
  }
}

/* ----------- Daily report → Slack (table), then Logout ----------- */

/* Replaced sendDailyReportToSlack with Block Kit multi-section table-style message */

/* ---------- Replaced Daily Report sender: Markdown-style simple report ---------- */

/* ---------- Replaced Daily Report sender: Block Kit table-style message ---------- */
async function sendDailyReportToSlack(){
  try{
    if(!lastUser) return;
    const today = ymd(new Date());
    // aggregate user's logs for the day
    let work=0, meet=0, lunch=0, br=0, smm=0, activity=0, copyright=0;
    try{
      const snap = await getDocs(query(collection(db,'userTimeLogs', lastUser.uid, 'logs'), where('ymd','==', today)));
      snap.forEach(d=>{
        const x=d.data()||{};
        const sec = Number(x.duration) || 0;
        const t = String((x.type||'').toLowerCase());
        if(t==='work') work+=sec;
        else if(t==='meeting') meet+=sec;
        else if(t==='lunch') lunch+=sec;
        else if(t==='break') br+=sec;
        else if(t==='smm') smm+=sec;
        else if(t==='activity') activity+=sec;
        else if(t==='copyright') copyright+=sec;
      });
    }catch(e){
      console.warn('sendDailyReportToSlack: failed to aggregate userTimeLogs', e);
    }
    const total = work+meet+lunch+br+smm+activity+copyright;
    // office time (attendance)
    let officeStr = '—';
    try{
      const key = `${lastUser.uid}_${today}`;
      const at = await getDoc(doc(db,'attendance', key));
      const ms = at.exists() ? (at.data().totalMs ?? null) : null;
      if(ms!=null) officeStr = fmt(Math.round(ms/1000));
    }catch(e){}
    const name = userDisplay();

    // Build Block Kit: columns and values
    const columns = ['Name','Date','Work','Meeting','Lunch','Break','SMM','Activity','Copyright','Total','Office Time'];
    const values  = [name, today, fmt(work), fmt(meet), fmt(lunch), fmt(br), fmt(smm), fmt(activity), fmt(copyright), fmt(total), officeStr];

    // Break into chunks of up to 8 fields per section for readability
    const MAX_FIELDS = 8;
    const chunks = [];
    for(let i=0;i<columns.length;i+=MAX_FIELDS){
      const hdr = columns.slice(i,i+MAX_FIELDS);
      const vals = values.slice(i,i+MAX_FIELDS);
      const fields = hdr.map((h, idx) => ({ type: 'mrkdwn', text: `*${h}*\n${vals[idx] ?? ''}` }));
      chunks.push(fields);
    }

    const blocks = [];
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `📊 ${userDisplay()} Daily Report`, emoji: true } });
    blocks.push({ type: 'divider' });
    // Push each chunk as a section to maintain visual alignment
    for(const fields of chunks){
      blocks.push({ type: 'section', fields });
    }
    blocks.push({ type: 'context', elements: [ { type: 'mrkdwn', text: `_Generated: ${new Date().toLocaleString()}_` } ] });

    await sendSlackBlocksViaProxy(blocks);
  }catch(err){
    console.warn('sendDailyReportToSlack Block Kit failed, falling back to markdown', err);
    // fallback to previous markdown-style send
    try{
      const textLines = [];
      textLines.push('*📊 Daily Report*');
      textLines.push(`*Name:* ${userDisplay()}`);
      textLines.push(`*Date:* ${today}`);
      textLines.push('');
      textLines.push(`*Work:* ${fmt(work)}`);
      textLines.push(`*Meeting:* ${fmt(meet)}`);
      textLines.push(`*Lunch:* ${fmt(lunch)}`);
      textLines.push(`*Break:* ${fmt(br)}`);
      textLines.push(`*SMM:* ${fmt(smm)}`);
      textLines.push(`*Activity:* ${fmt(activity)}`);
      textLines.push(`*Copyright:* ${fmt(copyright)}`);
      textLines.push(`*Total:* ${fmt(total)}`);
      textLines.push(`*Office Time:* ${officeStr}`);
      const payloadText = textLines.join('\n');
      if(typeof postSlack === 'function'){
        await postSlack(payloadText);
      } else if (typeof SLACK_WEBHOOK !== 'undefined'){
        await fetch(SLACK_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: payloadText }) });
      }
    }catch(e){ console.error('sendDailyReportToSlack fallback failed', e); }
  }
}




async function endDayAndLogout(){
  try{
    if(current){
      if(current.type === 'work'){
        const hStart = current.startMs;
        const hEnd = Date.now();
        await openWorkReport({
          title: 'End-of-Day Work Report',
          desc: 'Before logging out, record focused work for your final segment.',
          hStart, hEnd,
          onAfterSubmit: async ()=>{
            await stopAndSave();
            await sendDailyReportToSlack();
            await markAttendanceLogout();
            await writeDualLogs('logout', 0, Date.now());
            await clearActiveSession();
            await onSignoutRemoved();
          }
        });
        return;
      } else if(current.type === 'copyright'){
        const cStart = current.startMs;
        const cEnd = Date.now();
        await openCopyrightReport({
          cStart, cEnd,
          onAfterSubmit: async ()=>{
            await stopAndSave();
            await sendDailyReportToSlack();
            await markAttendanceLogout();
            await writeDualLogs('logout', 0, Date.now());
            await clearActiveSession();
            await onSignoutRemoved();
          }
        });
        return;
      } else {
        await stopAndSave();
      }
    }
    await sendDailyReportToSlack();
    await markAttendanceLogout();
    await writeDualLogs('logout', 0, Date.now());
  }catch(e){ console.warn('endDay marker/report failed', e); }
  await clearActiveSession();
  await onSignoutRemoved();
}

/* ------------------ Write to BOTH collections ------------------ */
async function writeDualLogs(type, durationSec, startedAtMs){
  const base = {
    userId: lastUser.uid, type, duration: durationSec,
    startedAtMs, stoppedAt: serverTimestamp(), ymd: ymd(new Date())
  };
  await Promise.all([
    addDoc(collection(db,'timeLogsMaster'), base),
    addDoc(collection(db,'userTimeLogs', lastUser.uid, 'logs'), base)
  ]);
}

/* ------------------ Stop & Save ------------------ */
async function stopAndSave(){
  if(!current || !lastUser) return;
  const durationSec = Math.max(1, Math.round((Date.now()-current.startMs)/1000));
  await writeDualLogs(current.type, durationSec, current.startMs);
  await clearActiveSession();
  stopTick();
  await Promise.all([loadLogs(), loadTotals(), loadWeekly()]);
}

/* ------------------ Report modal helper (work) ------------------ */
/**
 * Reworked openWorkReport:
 * - resolves on submit (same behavior as before)
 * - ALSO resolves when user dismisses/closes modal (Back/X)
 * - when dismissed, it DOES NOT call onAfterSubmit, DOES NOT stop timers
 * - logs dismissal (fire-and-forget)
 *
 * Additional options:
 * - remindersEverySec : if provided, sends reminders every N seconds (desktop + slack) until submit/dismiss
 * - isInactivityReport : boolean (for inactivity flow behaviour; no extra dual-log happens here)
 * - isHourlyReport: boolean (hourly callers can mark this)
 *
 * IMPORTANT: For hourly flows we persist hourlyReports + writeDualLogs inside this function (the caller may pass isHourlyReport)
 * For inactivity flows, do not double-write work logs (caller should persist prior to calling openWorkReport).
 */
function openWorkReport({ title, desc, hStart, hEnd, onAfterSubmit, remindersEverySec = 0, isInactivityReport = false, isHourlyReport = false }){
  return new Promise((resolve)=>{
    // Defensive: if UI missing, resolve and call onAfterSubmit if present (preserve old behavior)
    if(!hourModal || !btnHourSubmit || !hourInput || !hourCatSel){
      resolve(); onAfterSubmit?.(); return;
    }

    hourTitle.textContent = title || 'Work Report';
    const descEl = document.getElementById('hourDesc');
    if (descEl) descEl.textContent = desc || 'How much focused work did you do?';
    hourInput.value = '';
    hourCatSel.value = '';
    show(hourModal);
    
    // Disable backdrop click for hourly reports
    if (isHourlyReport && hourModal) {
      hourModal.style.pointerEvents = 'none';
      const modalCard = hourModal.querySelector('.modal-card');
      if (modalCard) modalCard.style.pointerEvents = 'auto';
    }
    
    // Initialize validation immediately
    validateWorkReportForm();
    hourInput?.addEventListener('input', validateWorkReportForm);
    hourCatSel?.addEventListener('change', validateWorkReportForm);
    
    // Auto-open time picker dropdown
    setTimeout(() => {
      const timePicker = document.getElementById('timePicker');
      if (timePicker) {
        timePicker.style.display = 'block';
        timePicker.style.opacity = '1';
      }
    }, 50);

    // Mark modal-open state so hourly tick logic knows it's open
    if (current) current.hourModalOpen = true;

    let resolved = false;
    const safeResolve = (val) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      try{ resolve(val); }catch(e){ console.warn('openWorkReport resolve error', e); }
    };

    // cleanup function to remove listeners/observers
    const cleanup = () => {
      try {
        hourCloseEl?.removeEventListener('click', onCancel);
      } catch(_) {}
      try {
        btnHourBackEl?.removeEventListener('click', onCancel);
      } catch(_) {}
      try {
        hourModal?.removeEventListener('click', modalClickHandler);
        const modalCard = hourModal?.querySelector('.modal-card');
        modalCard?.removeEventListener('click', (e) => e.stopPropagation());
      } catch(_) {}
      try { btnHourSubmit.onclick = null; } catch(_) {}
      try { escapeHandler && window.removeEventListener('keydown', escapeHandler); } catch(_) {}
      try { observer && observer.disconnect(); } catch(_) {}
      if (current) current.hourModalOpen = false;
      
      // Reset pointer events
      if (hourModal) {
        hourModal.style.pointerEvents = '';
        const modalCard = hourModal.querySelector('.modal-card');
        if (modalCard) modalCard.style.pointerEvents = '';
      }

      // clear reminders if any
      try{
        if(current && current._inactivityReminderInterval){ clearInterval(current._inactivityReminderInterval); current._inactivityReminderInterval = null; }
      }catch(e){ console.warn('cleanup reminders failed', e); }
    };

    // Cancel / dismiss handler (Back button or close)
    const onCancel = async (ev) => {
      try {
        hide(hourModal);
        // log dismissal (non-blocking)
        try { logPopupDismissal({ kind: 'workSegment', extra: { reason: 'user_dismissed_back' } }); } catch(_){}
      } catch (err) {
        console.warn('openWorkReport onCancel error', err);
      } finally {
        safeResolve();
      }
    };

    // Elements that may trigger cancel
    const hourCloseEl = document.getElementById('hourClose');
    const btnHourBackEl = document.getElementById('btnHourBack');

    // Hide/show buttons based on report type
    if (isHourlyReport) {
      if (hourCloseEl) hourCloseEl.style.display = 'none';
      if (btnHourBackEl) btnHourBackEl.style.display = 'none';
    } else {
      if (hourCloseEl) hourCloseEl.style.display = 'flex';
      if (btnHourBackEl) btnHourBackEl.style.display = 'block';
      
      // Remove old handlers (defensive)
      try { hourCloseEl?.removeEventListener('click', onCancel); } catch(_) {}
      try { btnHourBackEl?.removeEventListener('click', onCancel); } catch(_) {}

      // Attach cancel listeners
      hourCloseEl?.addEventListener('click', onCancel, { passive: true });
      btnHourBackEl?.addEventListener('click', onCancel, { passive: true });
    }

    // Also handle Escape key (non-destructive) - but not for hourly reports
    const escapeHandler = (ev) => {
      if (ev.key === 'Escape' && hourModal && hourModal.classList.contains('show') && !isHourlyReport) {
        onCancel();
      }
    };
    window.addEventListener('keydown', escapeHandler);

    // Prevent modal close on outside click for hourly reports
    const modalClickHandler = (e) => {
      if (isHourlyReport) {
        e.stopPropagation();
        return; // Don't close hourly reports on outside click
      }
      if (e.target === hourModal) {
        onCancel();
      }
    };
    hourModal?.addEventListener('click', modalClickHandler);
    
    // Prevent clicks on modal card from bubbling up
    const modalCard = hourModal?.querySelector('.modal-card');
    modalCard?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // In case modal is hidden externally (some other code removes 'show'), watch for class change and treat as cancel
    let observer = null;
    try {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const el = m.target;
            if (el && el instanceof HTMLElement) {
              const hasShow = el.classList.contains('show');
              // if 'show' removed and modal is not submitting, treat as cancel (but not for hourly reports)
              if (!hasShow && !resolved && !isHourlyReport) {
                onCancel();
              }
            }
          }
        }
      });
      observer.observe(hourModal, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {
      observer = null;
    }

    // START: optional reminders (every N seconds) if user does not submit the report
    try {
      if(remindersEverySec && remindersEverySec > 0){
        // clear existing first
        if(current && current._inactivityReminderInterval){ clearInterval(current._inactivityReminderInterval); current._inactivityReminderInterval = null; }
        const intervalId = setInterval(async ()=>{
          try{
            const uname = userDisplay();
            showDesktopPopup("Report Reminder", `${uname} — Please submit your work segment report.`);
            await postNoticeToSlack("Report Reminder", "User did not submit the work-segment/hourly report yet.");
          }catch(e){ console.warn('report reminder failed', e); }
        }, remindersEverySec*1000);
        if(current) current._inactivityReminderInterval = intervalId;
      }
    } catch (e) {
      console.warn('Failed to start report reminder timer', e);
    }
    // END: reminders

    // Time picker functionality
    const timePickerBtn = document.getElementById('timePickerBtn');
    const timePicker = document.getElementById('timePicker');
    const hoursPicker = document.getElementById('hoursPicker');
    const minutesPicker = document.getElementById('minutesPicker');
    const secondsPicker = document.getElementById('secondsPicker');
    const applyTimeBtn = document.getElementById('applyTime');
    const cancelTimeBtn = document.getElementById('cancelTime');

    // Toggle time picker with instant display
    timePickerBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = timePicker.style.display === 'block';
      if (isVisible) {
        timePicker.style.display = 'none';
      } else {
        timePicker.style.display = 'block';
        timePicker.style.opacity = '1';
      }
    });

    // Apply time from picker
    applyTimeBtn?.addEventListener('click', () => {
      const hours = parseInt(hoursPicker.value) || 0;
      const minutes = parseInt(minutesPicker.value) || 0;
      const seconds = parseInt(secondsPicker.value) || 0;
      
      let timeStr = '';
      if (hours > 0) {
        timeStr = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      
      hourInput.value = timeStr;
      timePicker.style.display = 'none';
      validateForm();
    });

    // Cancel time picker
    cancelTimeBtn?.addEventListener('click', () => {
      timePicker.style.display = 'none';
    });

    // Close time picker when clicking outside
    document.addEventListener('click', (e) => {
      if (timePicker && timePickerBtn && !timePicker.contains(e.target) && !timePickerBtn.contains(e.target)) {
        timePicker.style.display = 'none';
      }
    });

    // Form validation function
    const validateForm = () => {
      const input = (hourInput.value || '').trim();
      const category = hourCatSel.value || '';
      const isTimeValid = /^\d{1,2}:\d{2}(:\d{2})?$/.test(input);
      const isCategorySelected = category !== '';
      
      btnHourSubmit.disabled = !(isTimeValid && isCategorySelected);
    };

    // Add validation listeners
    hourInput?.addEventListener('input', validateForm);
    hourCatSel?.addEventListener('change', validateForm);

    // Initial validation
    validateForm();

    // Submit handler with lag protection
    let isSubmitting = false;
    btnHourSubmit.onclick = async () => {
      if (isSubmitting) return; // Prevent multiple submissions
      
      const input = (hourInput.value || '').trim();
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(input)) {
        alert('Please enter time in format mm:ss or hh:mm:ss (e.g., 48:00 or 1:40:15).');
        return;
      }
      const reportedSec = parseMmSsStrict(input);
      if (!Number.isFinite(reportedSec) || reportedSec < 0) {
        alert('Invalid time value.');
        return;
      }
      const category = hourCatSel.value || '';
      if (!category) {
        alert('Please select a category.');
        return;
      }
      
      isSubmitting = true; // Set flag to prevent multiple submissions
      
      // Instant popup close
      hide(hourModal);
      try{ if (current) current.hourModalOpen = false; }catch(_){}

      // Build the report object (include alternate fields expected by admin)
      const reportObj = {
        userId: lastUser.uid,
        ymd: ymd(new Date()),
        blockStartMs: hStart,
        blockEndMs: hEnd,
        hourStartMs: hStart,
        hourEndMs: hEnd,
        reportedSec,
        category,
        createdAt: serverTimestamp()
      };

      console.log('openWorkReport: submitting hourly/work report', { uid: lastUser?.uid, reportedSec, category, hStart, hEnd });

      try {
        // Persist the hourly report for Admin panel visibility (best-effort)
        try {
          const savedDoc = await addDoc(collection(db,'hourlyReports'), reportObj);
          console.log('Hourly report saved successfully:', { 
            id: savedDoc.id, 
            category, 
            reportedSec, 
            userId: lastUser.uid,
            ymd: reportObj.ymd 
          });
          
          // Force productivity recalculation after saving
          setTimeout(async () => {
            try {
              await calculateAndUpdateProductivity();
              await updatePublicProductivity();
              console.log('Productivity recalculated after report submission');
            } catch(e) {
              console.error('Failed to recalculate productivity:', e);
            }
          }, 500);
          
          // Update trimming data if this was a trimming report
          if (category && category.toLowerCase() === 'trimming') {
            setTimeout(() => {
              try {
                fetchTrimmingData();
                console.log('Trimming data updated after trimming report submission');
              } catch(e) {
                console.error('Failed to update trimming data:', e);
              }
            }, 600);
          }
        } catch (saveErr) {
          console.error('Failed to save hourlyReports document:', saveErr);
          // still proceed
        }

        // IMPORTANT: Do NOT add the manually entered report time to the main "Work" total.
        // The report time should only be recorded for reporting/logging purposes in hourlyReports,
        // but should not modify or increase the running total "Work" time displayed in "My Totals".
        // The "My Totals" section should continue showing only the active timer-based work time.
        
        // Note: writeDualLogs('work', reportedSec, hStart) has been intentionally removed
        // to prevent the work segment report submission from affecting the main work totals.

        // Try posting to Slack — best-effort
        try {
          await postHourlyReportToSlack({ hStart, hEnd, reportedSec, category });
        } catch (slErr) {
          console.warn('postHourlyReportToSlack failed:', slErr);
        }

        // Call caller-provided handler (if any). Provide the object (note createdAt is a serverTimestamp token).
        if (typeof onAfterSubmit === 'function') {
          try { await onAfterSubmit(reportObj); } catch (e) { console.warn('openWorkReport onAfterSubmit error', e); }
        }
      } finally {
        isSubmitting = false; // Reset flag
        safeResolve();
      }
    };
  });
}

// Pending report object used when quit flow needs to save the report atomically
let __pendingReportForExit = null;

/**
 * Save early-exit + optional work report + outgoing email record atomically and then
 * post Slack notices and quit the app.
 * - reportObj: object or null
 * - reason: string
 * - submittedAtMs: number
 * - todayTotalSec: number
 */
async function saveExitAtomic({ reportObj=null, reason='', submittedAtMs=Date.now(), todayTotalSec=0 }){
  if (!lastUser) throw new Error('No authenticated user');
  try{
    const b = writeBatch(db);

    // earlyExitRequests doc
    const earlyRef = doc(collection(db,'earlyExitRequests'));
    b.set(earlyRef, {
      userId: lastUser.uid,
      name: userDisplay(),
      ymd: ymd(new Date(submittedAtMs)),
      submittedAt: serverTimestamp(),
      submittedAtMs,
      grand_total_time: todayTotalSec,
      todayTotalSec,
      reason: reason || '',
      status: 'pending'
    });

    // optional hourly report
    if (reportObj) {
      const hrRef = doc(collection(db,'hourlyReports'));
      b.set(hrRef, Object.assign({}, reportObj, { createdAt: serverTimestamp() }));
    }

    // Create an outgoing email record so admins can get an email via backend/process
    const emailRef = doc(collection(db,'outgoingEmails'));
    const emailBody = `User: ${userDisplay()}\nTime: ${toLocalDateTime(submittedAtMs)}\nTotal Time: ${fmt(todayTotalSec)}\nReason: ${reason}`;
    b.set(emailRef, {
      userId: lastUser.uid,
      to: 'hr@seekuniqueproductions.com',
      subject: `Early Exit Request — ${userDisplay()}`,
      body: emailBody,
      createdAt: serverTimestamp(),
      status: 'pending',
      meta: { earlyExitDocId: earlyRef.id }
    });

    // Commit batch atomically
    await b.commit();

    // Public sanitized notice (no reason)
    try{ await postNoticeToSlack('Exit Request Submitted', `User requested early exit. Total Time: ${fmt(todayTotalSec)}`); }catch(e){ console.warn('post public exit notice failed', e); }

    // Show success message to user
    alert('Exit request sent successfully! Please wait for admin approval.');

    // Clear the pending report
    __pendingReportForExit = null;

    // NOTE: do NOT quit here - wait for admin approval
    // The app should continue running until admin approves the exit request

  }catch(e){
    console.error('saveExitAtomic failed', e);
    alert('Failed to save exit request. Please try again.');
    throw e; // rethrow so callers may run fallback flows
  }
}

/* ------------------ Copyright report helper ------------------ */
/**
 * openCopyrightReport also resolves when the modal is dismissed (user closes it)
 * without invoking onAfterSubmit. Submitting keeps the existing behavior.
 */
function openCopyrightReport({ cStart, cEnd, onAfterSubmit }){
  return new Promise((resolve)=>{
    if(!copyModal || !btnCopySubmit || !copyCatSel || !btnCopyYes || !btnCopyNo){
      resolve(); onAfterSubmit?.(); return;
    }
    copyTitle.textContent = 'Copyright Check Report';
    // reset state
    copySelectedStatus = '';
    copyCatSel.value = '';
    if(copyNotes) copyNotes.value = '';
    const catWrap = document.getElementById('copyCatWrap');
    if (catWrap) catWrap.style.display = 'none';
    btnCopyYes.style.filter = 'none';
    btnCopyNo.style.filter  = 'none';

    show(copyModal);

    let resolved = false;
    const safeResolve = (val) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      try{ resolve(val); }catch(e){ console.warn('openCopyrightReport resolve error', e); }
    };

    const cleanup = () => {
      try { escapeHandler && window.removeEventListener('keydown', escapeHandler); } catch(_) {}
      try { observer && observer.disconnect(); } catch(_) {}
      try { btnCopySubmit.onclick = null; } catch(_) {}
    };

    // Dismiss detection: observer for class changes (hide)
    let observer = null;
    try {
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const el = m.target;
            if (el && el instanceof HTMLElement) {
              const hasShow = el.classList.contains('show');
              if (!hasShow && !resolved) {
                // log dismissal
                try { logPopupDismissal({ kind: 'copyright', extra: { reason: 'user_dismissed' } }); } catch(_){}
                safeResolve();
              }
            }
          }
        }
      });
      observer.observe(copyModal, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {
      observer = null;
    }

    // Escape key to dismiss (non-destructive)
    const escapeHandler = (ev) => {
      if (ev.key === 'Escape' && copyModal && copyModal.classList.contains('show')) {
        try { hide(copyModal); logPopupDismissal({ kind: 'copyright', extra: { reason: 'escape_dismiss' } }); } catch(_){}
        safeResolve();
      }
    };
    window.addEventListener('keydown', escapeHandler);

    btnCopySubmit.onclick = async ()=>{
      const status = copySelectedStatus; // 'issues_found' or 'no_issues'
      const category = copyCatSel.value;
      const notes = (document.getElementById('copyNotes')?.value ?? '').trim();

      if(!status){
        alert('Please select a Result: Yes or No.');
        return;
      }
      if(status === 'issues_found' && !category){
        alert('Please select a Category (Visual / Audio / Visual + Audio).');
        return;
      }

      const durationSec = Math.max(1, Math.round((cEnd - cStart)/1000));

      try{
        await addDoc(collection(db,'copyrightReports'), {
          userId: lastUser.uid,
          ymd: ymd(new Date()),
          blockStartMs: cStart,
          blockEndMs: cEnd,
          durationSec,
          category: status === 'issues_found' ? category : '',
          status, // 'no_issues' or 'issues_found'
          notes,
          createdAt: serverTimestamp()
        });
      }catch(e){ console.warn('copyrightReports save failed', e); }

      await postCopyrightToSlack({
        hStart: cStart,
        hEnd: cEnd,
        durationSec,
        category: status === 'issues_found' ? category : '',
        status,
        notes
      });

      hide(copyModal);
      try{ if (typeof onAfterSubmit === 'function') await onAfterSubmit(); } catch(e){ console.warn('openCopyrightReport onAfterSubmit error', e); } finally { safeResolve(); }
    };
  });
}

/* ------------------ Break Flow ------------------ */
$('btnStartBreak')?.addEventListener('click', async ()=>{
  hide(breakModal);
  if(current){
    if(current.type==='work'){
      const hStart=current.startMs, hEnd=Date.now();
      await openWorkReport({
        title:'Work Segment Report',
        desc:'Before break, record focused time for this segment.',
        hStart, hEnd,
        remindersEverySec: 120,
        onAfterSubmit: async ()=>{ await stopAndSave(); startTick('break'); }
      });
      return;
    } else if(current.type==='copyright'){
      const cStart=current.startMs, cEnd=Date.now();
      await openCopyrightReport({
        cStart, cEnd,
        onAfterSubmit: async ()=>{ await stopAndSave(); startTick('break'); }
      });
      return;
    } else {
      await stopAndSave();
    }
  }
  // If local break-approval lock exists, do not start break — prompt user to request approval
  if(breakRequiresApprovalForToday()){
    const pending = await hasPendingBreakApprovalToday();
    if(pending){
      alert('You have already requested additional break time. Waiting for admin approval.');
    } else {
      const send = confirm('Your break limit is reached and admin approval is required to take another break. Do you want to request approval now?');
      if(send){
        await requestBreakApproval('User requests additional break after reaching daily limit.');
        listenForBreakApprovals();
      }
    }
    return;
  }

  startTick('break');
  current.breakTimer = setTimeout(async ()=>{ if(current && current.type==='break'){ await stopAndSave(); } }, 10*60*1000);
});
$('btnSkipBreak')?.addEventListener('click', ()=>{ hide(breakModal); show(skipModal); });
$('btnCancelSkip')?.addEventListener('click', ()=> hide(skipModal));

/* ---- Enhanced lunch-skip request ---- */
$('btnSendSkip')?.addEventListener('click', async ()=>{
  const reasonEl = $('skipReason');
  const reason = (reasonEl?.value||'').trim();
  if(!reason || reason.length < 5){
    alert('Please provide a brief reason (at least 5 characters).');
    reasonEl?.focus();
    return;
  }
  await addDoc(collection(db,'approvals'), {
    userId:lastUser?.uid || '',
    type:'lunch-skip',
    reason,
    status:'pending',
    createdAt: serverTimestamp(),
    ymd: ymd(new Date())
  });
  hide(skipModal);
  showDesktopPopup('Lunch Skip Requested', 'Your request was sent to admin for approval.');
  postNoticeToSlack('Lunch Skip Request', `User submitted a lunch-skip request.\nReason: ${reason}`);
});

/* Disable "Send" if reason too short (UX hint) */
(function enhanceSkipModalUX(){
  const reasonEl = $('skipReason');
  const sendBtn = $('btnSendSkip');
  if(!reasonEl || !sendBtn) return;
  const sync = () => { sendBtn.disabled = (reasonEl.value.trim().length < 5); };
  reasonEl.addEventListener('input', sync);
  sync();
})();

/* ------------------ Load Logs (work only, USER VIEW) + DELETE ------------------ */
async function loadLogs(){
  if(!lastUser){ if(logsEl) logsEl.textContent='—'; return; }
  if(!logsEl) return;
  const q = query(collection(db,'userTimeLogs', lastUser.uid, 'logs'), where('type','==','work'));
  const snap = await getDocs(q);
  if(snap.empty){ logsEl.textContent='No logs yet.'; return; }
  const arr = []; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
  arr.sort((a,b)=> (b.startedAtMs||0)-(a.startedAtMs||0));
  logsEl.innerHTML='';
  arr.slice(0,50).forEach(l=>{
    const row=document.createElement('div'); row.className='log-row';
    const when = new Date(l.startedAtMs||Date.now()).toLocaleString();
    row.innerHTML=`
      <span>• ${fmt(l.duration)} — ${when}</span>
      <span>
        <button data-id="${l.id}" title="Delete"
          style="border:none;padding:6px 10px;border-radius:8px;color:#fff;cursor:pointer;
                 background:linear-gradient(135deg,#ef4444,#f97316)">
          Delete
        </button>
      </span>`;
    logsEl.appendChild(row);
  });
}
logsEl?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-id]'); if(!btn) return;
  const id = btn.dataset.id; const ok = confirm('Delete this log?'); if(!ok) return;
  try{
    await deleteDoc(doc(db,'userTimeLogs', lastUser.uid, 'logs', id));
    await Promise.all([loadLogs(), loadTotals(), loadWeekly()]);
  }catch(err){
    alert('Failed to delete log.'); console.error(err);
  }
});

/* ------------------ Disposition Bar Color Intensity Helper ------------------ */
// Target durations: Lunch=30min, Break=1h10min, Work=7h20min
function getDispositionBarColor(type, currentSec) {
  const targets = {
    work: 7 * 3600 + 20 * 60,    // 7h 20min = 26400 seconds
    lunch: 30 * 60,             // 30min = 1800 seconds  
    break: 1 * 3600 + 10 * 60   // 1h 10min = 4200 seconds
  };
  
  const targetSec = targets[type];
  if (!targetSec) return null; // Not a target-tracked disposition
  
  const progress = Math.min(currentSec / targetSec, 1.0);
  
  // Color palettes for each disposition
  const palettes = {
    work: { pale: '#6b1a7a40', mid: '#6b1a7a80', deep: '#6b1a7a' },
    lunch: { pale: '#fde04740', mid: '#fde04780', deep: '#fde047' },
    break: { pale: '#22d3ee40', mid: '#22d3ee80', deep: '#22d3ee' }
  };
  
  const palette = palettes[type];
  let color, glowEffect = '';
  
  if (progress >= 1.0) {
    // 100%+ completion: deep color + glow
    color = palette.deep;
    glowEffect = `box-shadow: 0 0 8px ${palette.deep}80;`;
  } else if (progress >= 0.5) {
    // 50-99%: interpolate between mid and deep
    const ratio = (progress - 0.5) / 0.5;
    color = progress >= 0.75 ? palette.deep : palette.mid;
  } else {
    // 0-49%: interpolate between pale and mid
    color = progress >= 0.25 ? palette.mid : palette.pale;
  }
  
  return { color, glowEffect };
}

/* ------------------ Totals (USER) — LIVE ------------------ */
async function loadTotals(){
  if(!lastUser){ if(totalsEl) totalsEl.textContent='—'; return; }
  if(!totalsEl) return;
  if (typeof totalsUnsub === 'function') { totalsUnsub(); totalsUnsub = null; }

  const today = ymd(new Date());
  const qToday = query(collection(db,'userTimeLogs', lastUser.uid, 'logs'), where('ymd','==', today));

  totalsUnsub = safeOnSnapshot(qToday, (snap)=>{
    let work=0, meet=0, lunch=0, br=0, smm=0, activity=0, copyright=0;
    snap.forEach(d=>{
      const x=d.data(), sec=Number(x.duration)||0;
      if(x.type==='work') work+=sec; else if(x.type==='meeting') meet+=sec; else if(x.type==='lunch') lunch+=sec;
      else if(x.type==='break') br+=sec; else if(x.type==='smm') smm+=sec; else if(x.type==='activity') activity+=sec;
      else if(x.type==='copyright') copyright+=sec;
    });
    
    const total = work+meet+lunch+br+smm+activity+copyright;
    const maxValue = Math.max(work, meet, lunch, br, smm, activity, copyright, total) || 1;
    
    // Get dynamic colors for target dispositions
    const workColor = getDispositionBarColor('work', work);
    const lunchColor = getDispositionBarColor('lunch', lunch);
    const breakColor = getDispositionBarColor('break', br);
    
    totalsEl.innerHTML = `
      <div class="bar-chart">
        <div class="bar-item">
          <div class="bar-label">Work</div>
          <div class="bar-container">
            <div class="bar-fill bar-work" style="width: ${(work/maxValue)*100}%; background: ${workColor ? workColor.color : 'linear-gradient(135deg, #4f065c, #6b1a7a)'}; ${workColor ? workColor.glowEffect : ''}"></div>
          </div>
          <div class="bar-value">${fmt(work)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Meeting</div>
          <div class="bar-container">
            <div class="bar-fill bar-meeting" style="width: ${(meet/maxValue)*100}%"></div>
          </div>
          <div class="bar-value">${fmt(meet)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Lunch</div>
          <div class="bar-container">
            <div class="bar-fill bar-lunch" style="width: ${(lunch/maxValue)*100}%; background: ${lunchColor ? lunchColor.color : 'linear-gradient(135deg, #f59e0b, #fde047)'}; ${lunchColor ? lunchColor.glowEffect : ''}"></div>
          </div>
          <div class="bar-value">${fmt(lunch)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Break</div>
          <div class="bar-container">
            <div class="bar-fill bar-break" style="width: ${(br/maxValue)*100}%; background: ${breakColor ? breakColor.color : 'linear-gradient(135deg, #0d9488, #22d3ee)'}; ${breakColor ? breakColor.glowEffect : ''}"></div>
          </div>
          <div class="bar-value">${fmt(br)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">SMM</div>
          <div class="bar-container">
            <div class="bar-fill bar-smm" style="width: ${(smm/maxValue)*100}%"></div>
          </div>
          <div class="bar-value">${fmt(smm)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Activity</div>
          <div class="bar-container">
            <div class="bar-fill bar-activity" style="width: ${(activity/maxValue)*100}%"></div>
          </div>
          <div class="bar-value">${fmt(activity)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Copyright</div>
          <div class="bar-container">
            <div class="bar-fill bar-copyright" style="width: ${(copyright/maxValue)*100}%"></div>
          </div>
          <div class="bar-value">${fmt(copyright)}</div>
        </div>
        <div class="bar-item">
          <div class="bar-label">Grand Total</div>
          <div class="bar-container">
            <div class="bar-fill bar-total" style="width: 100%"></div>
          </div>
          <div class="bar-value">${fmt(total)}</div>
        </div>
        <div class="bar-item" id="productivityRow">
          <div class="bar-label">Productivity</div>
          <div class="bar-container">
            <div class="bar-fill bar-productivity" style="width: 0%" id="productivityBar"></div>
          </div>
          <div class="bar-value" id="productivityValue">—</div>
        </div>
      </div>
    `;
    
    // Refresh productivity when totals update
    setTimeout(() => {
      try {
        calculateAndUpdateProductivity();
      } catch(e) {
        console.warn('Failed to refresh productivity on totals update:', e);
      }
    }, 100);
  }, (err)=>{ console.warn('totals onSnapshot failed', err); });
  return;
}

/* ------------------ Dynamic Productivity (Trimming/Target * 100) ------------------ */
let lastValidProductivity = 0;

function listenProductivityForUser(){
  try{
    if(typeof productivityUnsub === 'function'){ productivityUnsub(); productivityUnsub = null; }
    if(!lastUser) return;
    
    const today = ymd(new Date());
    const qHR = query(collection(db,'hourlyReports'), where('userId','==', lastUser.uid), where('ymd','==', today));
    productivityUnsub = safeOnSnapshot(qHR, async () => {
      await calculateAndUpdateProductivity();
    }, 'productivity-listener');
    
    // Initial calculation
    setTimeout(() => calculateAndUpdateProductivity(), 100);
  }catch(e){ console.warn('listenProductivityForUser failed', e); }
}

// Manual refresh function for productivity
function refreshProductivity() {
  try {
    calculateAndUpdateProductivity();
    console.log('Manual productivity refresh triggered');
  } catch(e) {
    console.warn('Manual productivity refresh failed:', e);
  }
}

// Expose refresh function globally for debugging
window.refreshProductivity = refreshProductivity;

// Update public productivity collection for comparison chart
async function updatePublicProductivity() {
  if (!lastUser) return;
  
  try {
    const today = ymd(new Date());
    const productivityEl = document.getElementById('productivityValue');
    const productivity = parseInt(productivityEl?.textContent) || 0;
    
    const layeringProductivity = await calculateLayeringProductivity();
    
    await setDoc(doc(db, 'publicProductivity', lastUser.uid), {
      userId: lastUser.uid,
      displayName: lastUser.displayName || lastUser.email?.split('@')[0] || 'User',
      productivity: productivity,
      layeringProductivity: layeringProductivity,
      date: today,
      updatedAt: serverTimestamp()
    });
    
    console.log('Public productivity updated:', productivity + '%, layering:', layeringProductivity + '%');
  } catch (error) {
    console.warn('Failed to update public productivity:', error);
  }
}

async function calculateLayeringProductivity() {
  if (!lastUser) return 0;
  try {
    const today = ymd(new Date());
    const hourlyReportsSnap = await getDocs(query(collection(db, 'hourlyReports'), where('userId', '==', lastUser.uid), where('ymd', '==', today)));
    let totalLayeringSec = 0;
    hourlyReportsSnap.forEach(d => {
      const data = d.data();
      if ((data.category || '').toLowerCase() === 'layering') {
        totalLayeringSec += Number(data.reportedSec || 0);
      }
    });
    return Math.round(Math.min((totalLayeringSec / 3600) * 100, 100) * 10) / 10;
  } catch (error) {
    return 0;
  }
}

async function calculateAndUpdateProductivity() {
  const el = document.getElementById('productivityValue');
  const barEl = document.getElementById('productivityBar');
  if(!el || !lastUser) {
    console.warn('Cannot calculate productivity: missing element or user');
    return;
  }
  
  try {
    const today = ymd(new Date());
    console.log('Calculating productivity for user:', lastUser.uid, 'date:', today);
    
    // Get all hourly reports for today
    const hourlyReportsSnap = await getDocs(
      query(
        collection(db, 'hourlyReports'),
        where('userId', '==', lastUser.uid),
        where('ymd', '==', today)
      )
    );
    
    console.log('Found', hourlyReportsSnap.size, 'hourly reports for today');
    
    let totalTrimmingSec = 0;
    let reportCount = 0;
    hourlyReportsSnap.forEach(d => {
      const data = d.data();
      const category = (data.category || '').toLowerCase();
      const reportedSec = Number(data.reportedSec || 0);
      
      console.log('Report:', { category, reportedSec, id: d.id });
      
      if (category === 'trimming') {
        totalTrimmingSec += reportedSec;
        reportCount++;
      }
    });
    
    console.log('Total trimming time:', totalTrimmingSec, 'seconds from', reportCount, 'reports');
    
    // Get user's target
    let targetSec = 3600; // Default 1 hour
    try {
      const targetDoc = await getDoc(doc(db, 'targets', lastUser.uid));
      if(targetDoc.exists()) {
        const targetData = targetDoc.data();
        targetSec = Number(targetData.hourlyTargetSec || targetData.dailyTargetSec || 3600);
        console.log('User target found:', targetSec, 'seconds');
      } else {
        console.log('No user target found, using default:', targetSec, 'seconds');
      }
    } catch(e) {
      console.warn('Failed to get target:', e);
    }
    
    // Calculate productivity percentage (capped at 100%)
    let productivity = 0;
    if (totalTrimmingSec > 0 && targetSec > 0) {
      productivity = (totalTrimmingSec / targetSec) * 100;
      productivity = Math.min(Math.round(productivity * 10) / 10, 100); // Cap at 100%
      lastValidProductivity = productivity;
    }
    
    console.log('Calculated productivity:', productivity + '%');
    
    // Update the display (hide target from user)
    el.textContent = `${productivity}%`;
    
    // Update the bar width (already capped at 100%)
    if (barEl) {
      barEl.style.width = `${productivity}%`;
    }
    
    console.log('Updated productivity display:', productivity + '%');
    
    // Update user document with productivity stats
    try {
      await setDoc(doc(db, 'users', lastUser.uid), {
        productivity: productivity,
        trimmingTime: totalTrimmingSec,
        targetTime: targetSec,
        lastProductivityUpdate: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log('User document updated with productivity stats');
      
      // Also update public productivity for comparison chart
      await updatePublicProductivity();
    } catch(e) {
      console.warn('Failed to update user productivity:', e);
    }
    
  } catch(e) {
    console.error('productivity calculation failed', e);
    el.textContent = '0%';
    if (barEl) barEl.style.width = '0%';
  }
}

/* ------------------ Weekly (work only) ------------------ */
async function loadWeekly(){
  if(!lastUser){ if(weeklyEl) weeklyEl.textContent='—'; return; }
  if(!weeklyEl) return;
  const snap = await getDocs(query(collection(db,'userTimeLogs', lastUser.uid, 'logs'), where('type','==','work')));
  const map = new Map(); const end=new Date(), start=new Date(); start.setDate(end.getDate()-6);
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){ map.set(ymd(d),0); }
  snap.forEach(d=>{ const x=d.data(); if(map.has(x.ymd)) map.set(x.ymd, map.get(x.ymd)+(Number(x.duration)||0)); });
  let html=''; for(const [day,sec] of map.entries()){ html += `<div class="log-row">${day}<span>${fmt(sec)}</span></div>`; }
  weeklyEl.innerHTML = html || '—';
}

/* ------------------ CSV Export ------------------ */
$('btnExport')?.addEventListener('click', async ()=>{
  if(!lastUser) return;
  const snap = await getDocs(query(collection(db,'userTimeLogs', lastUser.uid, 'logs')));
  const rows = [['Type','StartedAt(ms)','Duration(sec)','Duration(HH:MM:SS)']];
  snap.forEach(d=>{ const x=d.data(); rows.push([x.type, x.startedAtMs||'', x.duration||0, fmt(x.duration||0)]); });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='my_timelogs.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

/* ------------------ DEV/QA: Test Desktop Popup ------------------ */
(function ensureTestPopupButton(){
  if (document.getElementById('btnTestPopup')) return;
  const b = document.createElement('button');
  b.id = 'btnTestPopup';
  b.textContent = 'Test Desktop Popup';
  Object.assign(b.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: 999999,
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,.25)',
    fontWeight: '600'
  });
  b.addEventListener('click', ()=>{
    showDesktopPopup('Test Notification', 'This is how desktop popups will look.');
  });
  document.body.appendChild(b);
})();

/* ===================== NEW FEATURE: Exit Restriction Before 9 Hours ===================== */
const REQUIRED_TODAY_SECONDS = 9 * 3600;

async function getTodayTotalsSec(){
  if(!lastUser) return 0;
  const today = ymd(new Date());
  const snap = await getDocs(query(collection(db,'userTimeLogs', lastUser.uid, 'logs'), where('ymd','==', today)));
  let total = 0;
  snap.forEach(d => { total += Number(d.data()?.duration)||0; });
  return total;
}

/* NEW: include currently running segment (if started today) */
async function getTodayTotalsSecIncludingCurrent(){
  let base = await getTodayTotalsSec();
  try{
    if(current){
      const startDay = ymd(new Date(current.startMs));
      const today = ymd(new Date());
      if (startDay === today) {
        base += Math.max(0, Math.round((Date.now() - current.startMs)/1000));
      }
    }
  }catch{}
  return base;
}

/* Slack message for early exit (sanitized — reason omitted) */
async function postEarlyExitToSlack({ submittedAtMs, todayTotalSec }){
  const name = userDisplay();
  const table = boxedTable(
    ['Name','Date','Submitted At','Today Total'],
    [[
      name,
      ymd(new Date(submittedAtMs)),
      toLocalDateTime(submittedAtMs),
      fmt(todayTotalSec)
    ]]
  );
  await postSlack(`*Early Exit Request*\n${table}`);
}

/* Persist early exit record */
async function saveEarlyExitRecord({ reason, submittedAtMs, todayTotalSec }){
  try{
    const ref = await addDoc(collection(db,'earlyExitRequests'), {
      userId: lastUser?.uid || '',
      name: userDisplay(),
      ymd: ymd(new Date(submittedAtMs)),
      submittedAt: serverTimestamp(),
      submittedAtMs,
      todayTotalSec,
      reason,
      status: 'pending'
    });
    return ref.id;
  }catch(e){ console.warn('saveEarlyExitRecord failed', e); }
}

/* Modal wiring (graceful if HTML lacks these nodes) */
const exitConfirmModal = document.getElementById('exitConfirmModal');
const exitReasonModal  = document.getElementById('exitReasonModal');
const exitNo           = document.getElementById('exitNo');
const exitYes          = document.getElementById('exitYes');
const exitReasonBack   = document.getElementById('exitReasonBack');
const exitReasonInput  = document.getElementById('exitReasonInput');
const sendEarlyExit    = document.getElementById('sendEarlyExit');

function showExitConfirm(){ try{ exitConfirmModal?.classList.add('show'); }catch{} }
function hideExitConfirm(){ try{ exitConfirmModal?.classList.remove('show'); }catch{} }
function showExitReason(){ try{ exitReasonModal?.classList.add('show'); }catch{} }
function hideExitReason(){ try{ exitReasonModal?.classList.remove('show'); }catch{} }

exitNo?.addEventListener('click', ()=> {
  try {
    hideExitConfirm();
    // Clear any pending report data
    __pendingReportForExit = null;
  } catch(e) {
    console.warn('exitNo handler failed', e);
  }
});

// ------------------ UPDATED exitYes handler (requires work OR copyright report before exit) ------------------
exitYes?.addEventListener('click', async () => {
  try {
    hideExitConfirm();

    // If currently working, require the hourly/work report first (existing flow)
    if (current && String(current.type || '').toLowerCase() === 'work') {
      __pendingReportForExit = null;
      let submitted = false;
      await openWorkReport({
        title: 'Work Segment Report',
        desc: 'Please fill this before quitting.',
        hStart: current.hourStartMs || current.startMs || Date.now(),
        hEnd: Date.now(),
        remindersEverySec: 120,
        onAfterSubmit: async (reportObj) => {
          submitted = true;
          __pendingReportForExit = reportObj || null;
        }
      });
      if (!submitted) {
        // user dismissed the report -> cancel exit flow
        return;
      }
    }

    // NEW: If currently in a copyright check, require the copyright report first
    if (current && String(current.type || '').toLowerCase() === 'copyright') {
      let submittedCopyright = false;
      // openCopyrightReport resolves when submitted or dismissed.
      await openCopyrightReport({
        cStart: current.startMs,
        cEnd: Date.now(),
        onAfterSubmit: async () => {
          submittedCopyright = true;
          // Note: openCopyrightReport already posts to copyrightReports and Slack.
          // If you want to capture the saved doc id or details, adapt openCopyrightReport to return them.
        }
      });
      if (!submittedCopyright) {
        // user dismissed the copyright modal -> cancel exit flow
        return;
      }
    }

    // Clear the reason input and show the reason modal
    if (exitReasonInput) exitReasonInput.value = '';
    if (sendEarlyExit) sendEarlyExit.disabled = true;
    
    // If we've reached here, either there was no blocking session or the required report(s) were submitted.
    showExitReason();
  } catch (e) {
    console.warn('exitYes handler failed', e);
  }
});


// Back on the Exit Reason modal: close the reason modal and continue app (do not affect timers)
exitReasonBack?.addEventListener('click', ()=>{
  try{
    hideExitReason();
    // also hide confirm if it's still visible
    hideExitConfirm();
    // Clear the reason input
    if (exitReasonInput) exitReasonInput.value = '';
    if (sendEarlyExit) sendEarlyExit.disabled = true;
    // log for analytics (non-blocking)
    try{ logPopupDismissal && logPopupDismissal({ kind: 'earlyExitReasonBack' }); }catch(_){}
  }catch(e){ console.warn('exitReasonBack handler failed', e); }
});

/* start disabled until input */
if (sendEarlyExit) sendEarlyExit.disabled = true;
exitReasonInput?.addEventListener('input', ()=>{
  const ok = (exitReasonInput.value || '').trim().length >= 5; // Require at least 5 characters
  if (sendEarlyExit) sendEarlyExit.disabled = !ok;
});

/* Guarded flow for Day End */
async function guardedExitFlow(){
  const todaySec = await getTodayTotalsSecIncludingCurrent();

  // If already >= 9h, proceed with your existing logout flow
  if (todaySec >= REQUIRED_TODAY_SECONDS) {
    await endDayAndLogout();
    return;
  }

  // If modals exist, use glassmorphism UI; else fall back to confirm/prompt.
  if (exitConfirmModal && exitReasonModal) {
    // If user is currently working, we must show the 'fill work report' first.
    // exitYes will handle opening the work report and then showing the reason modal.
    showExitConfirm();
  } else {
    const go = confirm("Your total working hours are not yet complete. Do you still want to exit the app?");
    if (!go) return;
    let reason = prompt("Please enter a reason for leaving early:");
    if (!reason || !reason.trim()) return;

    const submittedAtMs = Date.now();
    try{
      // Fallback path when modals are missing: save and notify with atomic-like best effort
      await saveEarlyExitRecord({ reason: reason.trim(), submittedAtMs, todayTotalSec: todaySec });
      await postEarlyExitToSlack({ reason: reason.trim(), submittedAtMs, todayTotalSec: todaySec });
    }catch(e){ console.warn('early exit fallback notify failed', e); }

    /* >>> CHANGED: quit via centralized helper <<< */
    await finishAndQuit();
  }
}

/* Send to admin (modal path) */
sendEarlyExit?.addEventListener('click', async ()=>{
  const reason = (exitReasonInput?.value||'').trim();
  if (!reason) {
    alert('Please enter a reason for leaving early.');
    return;
  }

  const submittedAtMs = Date.now();
  const todaySec = await getTodayTotalsSecIncludingCurrent();
  const currentTime = new Date().toLocaleString();

  console.log('sendEarlyExit: creating exit request', { reason, submittedAtMs, todaySec, username: userDisplay(), currentTime });
  
  // Disable button to prevent double submission
  if (sendEarlyExit) sendEarlyExit.disabled = true;
  
  try{
    // Use the atomic save function that handles everything properly
    await saveExitAtomic({ 
      reportObj: __pendingReportForExit, 
      reason: reason, 
      submittedAtMs: submittedAtMs, 
      todayTotalSec: todaySec 
    });
    
    // Hide modals
    hideExitReason();
    hideExitConfirm();
    
    // The saveExitAtomic function handles the quit process
    return;
  }catch(e){
    console.error('sendEarlyExit: failed to create exit request', e);
    alert('Failed to send exit request. Please try again.');
    // Re-enable button on error
    if (sendEarlyExit) sendEarlyExit.disabled = false;
  }
});


/**
 * Fallback notifier when atomic DB save fails: best-effort Slack + outgoingEmails enqueue + quit.
 * Does NOT alter existing flows; used only as a resilient fallback.
 */
async function fallbackExitNotifyAndQuit({ reason='', submittedAtMs=Date.now(), todayTotalSec=0, reportObj=null } = {}){
  try{
    console.log('fallbackExitNotifyAndQuit: starting', { reason, submittedAtMs, todayTotalSec });
    // Public sanitized notice
    try{ await postNoticeToSlack('Exit Request Submitted (Fallback)', `User requested early exit. Total Time: ${fmt(todayTotalSec)}`); }catch(err){ console.warn('fallback public slack failed', err); }

    // Do NOT post the reason to Slack. Admin will be notified via email (outgoingEmails record).

    // Try to persist an outgoingEmails record (best-effort). If Firestore is not writable, queue in localStorage.
    const emailRecord = {
      userId: lastUser?.uid || null,
      to: 'hr@seekuniqueproductions.com',
      subject: `Early Exit Request — ${userDisplay()}`,
      body: `User: ${userDisplay()}\nTime: ${toLocalDateTime(submittedAtMs)}\nTotal Time: ${fmt(todayTotalSec)}\nReason: ${reason}`,
      createdAt: null,
      status: 'pending',
      meta: { fallback: true }
    };

    try{
      await addDoc(collection(db,'outgoingEmails'), Object.assign({}, emailRecord, { createdAt: serverTimestamp() }));
    }catch(err){
      try{
        // queue locally for later processing by a background task or on next successful run
        const key = 'pendingOutgoingEmails';
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.push(Object.assign({}, emailRecord, { queuedAt: Date.now() }));
        localStorage.setItem(key, JSON.stringify(arr));
        console.warn('queued outgoing email locally (fallback)');
      }catch(_){ console.warn('failed to queue outgoing email locally', err); }
    }

    // Try to persist hourly report if we captured one
    if (reportObj){
      try{ await addDoc(collection(db,'hourlyReports'), Object.assign({}, reportObj, { createdAt: serverTimestamp() })); }
      catch(err){ console.warn('fallback hourlyReports save failed', err); }
    }

    // Finally perform a local stop/save and quit (best-effort)
    try{ await stopAndSave(); }catch(_){}
    await finishAndQuit();
  }catch(e){
    console.error('fallbackExitNotifyAndQuit failed', e);
    // As a last resort, attempt to close the window anyway
    try{ await finishAndQuit(); }catch(_){ try{ window.close(); }catch(_){} }
  }
}

/**
 * Atomically save early-exit request and related artifacts, post Slack messages, and quit.
 * Returns the earlyExitRequest doc id.
 */
async function saveWorkReportAndExit({ reason, submittedAtMs, todayTotalSec }){
  if (!lastUser) throw new Error('no-user');
  // Prepare batch
  const batch = writeBatch(db);

  // earlyExitRequests doc
  const exitsCol = collection(db,'earlyExitRequests');
  const exitRef = doc(exitsCol); // new doc with auto id
  batch.set(exitRef, {
    userId: lastUser.uid,
    name: userDisplay(),
    ymd: ymd(new Date(submittedAtMs)),
    submittedAt: serverTimestamp(),
    submittedAtMs,
    grand_total_time: todayTotalSec,
    todayTotalSec,
    reason: reason || '',
    status: 'closed'
  });

  // If there is a current active session, also write logout marker and a 'logout' dual log
  // We'll create a logout log entry in both collections atomically by creating docs here.
  const logoutBase = {
    userId: lastUser.uid,
    type: 'logout',
    duration: 0,
    startedAtMs: Date.now(),
    stoppedAt: serverTimestamp(),
    ymd: ymd(new Date())
  };
  const tlMasterRef = doc(collection(db,'timeLogsMaster'));
  const userLogRef = doc(collection(db,'userTimeLogs', lastUser.uid, 'logs'));
  batch.set(tlMasterRef, logoutBase);
  batch.set(userLogRef, logoutBase);

  // Commit batch atomically
  await batch.commit();

  // Post Slack messages: public sanitized and private to admin
  try{
    const hoursStr = fmt(todayTotalSec);
    await postNoticeToSlack('User Quit Request', `${userDisplay()} requested to quit. Total Time: ${hoursStr}`);
  }catch(e){ console.warn('public quit notice failed', e); }

  // Create an outgoingEmails record so a trusted server-side worker can email HR with the reason.
  try{
    const emailRef = doc(collection(db,'outgoingEmails'));
    await setDoc(emailRef, {
      userId: lastUser.uid,
      to: 'hr@seekuniqueproductions.com',
      subject: `Exit Request Notification - ${userDisplay()}`,
      body: `Dear HR Team,\n\nA user has requested to exit the app.\n\nDetails:\n- Username: ${userDisplay()}\n- Reason: ${reason}\n- Time: ${new Date(submittedAtMs).toLocaleTimeString()}\n\nRegards,\nSystem Notification Bot`,
      createdAt: serverTimestamp(),
      status: 'pending',
      meta: { earlyExitId: exitRef.id }
    });
  }catch(e){ console.warn('creating outgoingEmails for HR failed', e); }

  // After commit and notifications, perform final local save and quit
  try{ await stopAndSave(); }catch(_){}
  await finishAndQuit();

  return exitRef.id;
}

function listenEarlyExitApprovalForToday(){
  try{
    if (!lastUser) return;
    if (_earlyExitUnsub) { _earlyExitUnsub(); _earlyExitUnsub = null; }
    const today = ymd(new Date());
    const q = query(collection(db,'earlyExitRequests'), where('userId','==', lastUser.uid), where('ymd','==', today));
  _earlyExitUnsub = safeOnSnapshot(q, (snap)=>{
      snap.forEach(async (d)=>{
        const data = d.data() || {};
        const status = (data.status || '').toLowerCase();
        if (status === 'approved'){
          try{
            // Approved: show small approved toast then run final save & close flow
            showDesktopPopup('Exit Approved', 'Your early exit request was approved. Closing app...');
            // Send sanitized Slack and perform final DB save via finishAndQuit-like flow
            try{ await postNoticeToSlack('Session Closed', `${userDisplay()} | Session Closed | Total Time: ${fmt(await getTodayTotalsSecIncludingCurrent())}`); }catch(_){}
            // perform stopAndSave if necessary, then finish
            try{ await stopAndSave(); }catch(_){}
            await finishAndQuit();
          }catch(e){ console.warn('approval flow failed', e); }
        } else if (status === 'rejected'){
          try{
            showDesktopPopup('Exit Rejected', 'Your early exit request was rejected.');
            alert('Your early exit request was rejected by admin. You must continue working.');
          }catch(e){ console.warn(e); }
        }
      });
  }, (err)=>{ console.warn('earlyExit onSnapshot failed', err); });
  }catch(e){ console.warn('listenEarlyExitApprovalForToday setup failed', e); }
}

/* OPTIONAL: guard on tab/window close for early-exit under 9h */
window.addEventListener('beforeunload', (e) => {
  try {
    if (__exitingNow) return;

    // Only prevent close if we have the modals and user hasn't completed 9 hours
    if (!exitConfirmModal || !exitReasonModal) return;

    const nineHours = REQUIRED_TODAY_SECONDS;
    let sec = 0;
    try {
      // Try to get current total from the UI
      const totalEl = document.querySelector('.bar-value');
      if (totalEl && totalEl.textContent) {
        const parts = (totalEl.textContent || '00:00:00').split(':').map(n=>parseInt(n||0,10));
        if (parts.length === 3) sec = (parts[0]*3600 + parts[1]*60 + parts[2]) || 0;
      }
      // Add current running time if any
      if (current) {
        const startDay = ymd(new Date(current.startMs));
        const today = ymd(new Date());
        if (startDay === today) {
          sec += Math.max(0, Math.round((Date.now() - current.startMs)/1000));
        }
      }
    } catch {}

    if (sec < nineHours) {
      e.preventDefault();
      e.returnValue = 'You have not completed your required working hours. Are you sure you want to exit?';
      // Show the exit confirmation modal
      setTimeout(() => {
        try { showExitConfirm(); } catch {}
      }, 100);
    }
  } catch {}
});
/* =================== /NEW FEATURE: Exit Restriction Before 9 Hours =================== */

/* ===================== Case switcher for the Day Logout button ===================== */
const NINE_HOURS_SEC = REQUIRED_TODAY_SECONDS;

async function handleDayLogoutClick() {
  try {
    const totalSec = await getTodayTotalsSecIncludingCurrent();
    if (totalSec < NINE_HOURS_SEC) {
      await guardedExitFlow();
      return;
    }
    await endDayAndLogout();
    await finishAndQuit();
  } catch (e) {
    console.error('Day logout flow failed', e);
    try {
      await finishAndQuit();
    } catch(_) {
      try {
        if (window.native?.closeWindow) {
          await window.native.closeWindow();
        } else if (window.eTimer?.quit) {
          await window.eTimer.quit();
        } else {
          window.close();
        }
      } catch(_) {}
    }
  }
}
/* =================== /Case switcher for the Day Logout button =================== */

/* ------------------ File tail: cleanup, init, and remaining listeners ------------------ */

/**
 * Clean up function to clear intervals, timeouts and unsubscribes when window unloads
 * or when user logs out. Defensive: checks for existence before clearing.
 */
function cleanupAll() {
  try {
    // Clear global intervals
    if (attendancePing) { clearInterval(attendancePing); attendancePing = null; }
    // Clear current tick/timers
    try { stopTick(); } catch(_) {}
    // Unsubscribe listeners
    try { if (typeof totalsUnsub === 'function') { totalsUnsub(); totalsUnsub = null; } } catch(_) {}
    try { if (typeof productivityUnsub === 'function') { productivityUnsub(); productivityUnsub = null; } } catch(_) {}
    try { if (typeof _breakApprovalUnsub === 'function') { _breakApprovalUnsub(); _breakApprovalUnsub = null; } } catch(_) {}
    try { if (typeof lunchApprovalListenerUnsub === 'function') { lunchApprovalListenerUnsub(); lunchApprovalListenerUnsub = null; } } catch(_) {}
    try { if (typeof _earlyExitUnsub === 'function') { _earlyExitUnsub(); _earlyExitUnsub = null; } } catch(_) {}
    try { if (typeof _exitRequestUnsub === 'function') { _exitRequestUnsub(); _exitRequestUnsub = null; } } catch(_) {}
    // Clear any remaining local timers
    try { if (current && current.__firstBreakReminderTimeout) clearTimeout(current.__firstBreakReminderTimeout); } catch(_) {}
    try { if (current && current._inactivityReminderInterval) clearInterval(current._inactivityReminderInterval); } catch(_) {}
    // Cleanup productivity chart
    try { 
      if (window.cleanupProductivityChart) {
        window.cleanupProductivityChart();
      }
    } catch(_) {}
    // Cleanup trimming
    try { if (trimmingUnsubscribe) { trimmingUnsubscribe(); trimmingUnsubscribe = null; } } catch(_) {}
  } catch (e) {
    console.warn('cleanupAll encountered an error', e);
  }
}

// Ensure cleanup runs on unload
window.addEventListener('unload', () => {
  try { cleanupAll(); } catch (e) { console.warn('unload cleanup failed', e); }
});

// Also provide a manual call for external flows
window.__cleanupApp = cleanupAll;

/* Ensure we start listening for early-exit approvals for the current user.
   We create an additional onAuthStateChanged hook; it's safe to call multiple times.
*/
try {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      try { listenEarlyExitApprovalForToday(); } catch (e) { console.warn('listenEarlyExitApprovalForToday init failed', e); }
      try { listenForBreakApprovals(); } catch (e) { /* already called elsewhere but safe */ }
      try { listenForExitRequestResponses(); } catch (e) { console.warn('listenForExitRequestResponses init failed', e); }
    } else {
      // no user — cleanup
      cleanupAll();
    }
  });
} catch (e) {
  console.warn('secondary onAuthStateChanged hook failed', e);
}

/* Initialize early exit approval listener on page load */
setTimeout(() => {
  if (lastUser) {
    try { listenEarlyExitApprovalForToday(); } catch (e) { console.warn('delayed listenEarlyExitApprovalForToday init failed', e); }
  }
}, 2000);

/* Ensure Notification permission prompt (non-blocking) */
(async function ensureNotifications() {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(()=>{});
    }
  } catch (e) { console.warn('ensureNotifications failed', e); }
})();

/* Lightweight keyboard shortcuts (optional but helpful):
   - Alt+W -> start Work
   - Alt+B -> start Break
   - Alt+L -> start Lunch
   - Alt+M -> start Meeting
   - Alt+Q -> Quick Break (forceBreak)
*/
window.addEventListener('keydown', (ev) => {
  try {
    if (!ev.altKey) return;
    const k = (ev.key || '').toLowerCase();
    if (k === 'w') { ev.preventDefault(); startOrSwitch('work'); }
    else if (k === 'b') { ev.preventDefault(); startOrSwitch('break'); }
    else if (k === 'l') { ev.preventDefault(); startOrSwitch('lunch'); }
    else if (k === 'm') { ev.preventDefault(); startOrSwitch('meeting'); }
    else if (k === 'q') { ev.preventDefault(); forceBreak(); }
  } catch (e) { /* swallow */ }
});

/* Timer color management functions */
function updateTimerColors(type) {
  try {
    console.log('Updating timer colors to:', type);
    
    const colors = {
      work: '#22c55e',
      meeting: '#3b82f6', 
      lunch: '#f97316',
      break: '#06b6d4',
      smm: '#ec4899',
      activity: '#8b5cf6',
      copyright: '#06b6d4'
    };
    
    if (liveClock && colors[type]) {
      liveClock.style.color = colors[type];
      liveClock.style.background = 'none';
      liveClock.style.webkitBackgroundClip = 'unset';
      liveClock.style.webkitTextFillColor = 'unset';
      console.log('Set liveClock color to:', colors[type]);
    }
    
    if (liveType && colors[type]) {
      liveType.style.backgroundColor = colors[type];
      console.log('Set liveType background to:', colors[type]);
    }
  } catch(e) {
    console.warn('Failed to update timer colors:', e);
  }
}

function resetTimerColors() {
  try {
    const colorClasses = ['work-color', 'meeting-color', 'lunch-color', 'break-color', 'smm-color', 'activity-color', 'copyright-color'];
    
    if (liveClock) {
      colorClasses.forEach(cls => liveClock.classList.remove(cls));
    }
    
    if (liveType) {
      colorClasses.forEach(cls => liveType.classList.remove(cls));
    }
  } catch(e) {
    console.warn('Failed to reset timer colors:', e);
  }
}

/* Bar chart animation helper */
function updateBarChartAnimations() {
  try {
    const barFills = document.querySelectorAll('.bar-fill');
    barFills.forEach(bar => {
      if (bar.style.width && bar.style.width !== '0%') {
        bar.style.animation = 'none';
        bar.offsetHeight; // Trigger reflow
        bar.style.animation = null;
      }
    });
  } catch(e) {
    console.warn('Bar chart animation update failed:', e);
  }
}

/* ===================== TRIMMING SECTION FUNCTIONALITY ===================== */

// Trimming section elements
const trimmingSection = document.getElementById('trimmingSection');
const grandTrimmingTime = document.getElementById('grandTrimmingTime');
const latestTrimmingTime = document.getElementById('latestTrimmingTime');
const latestTrimmingWindow = document.getElementById('latestTrimmingWindow');
const viewMoreBtn = document.getElementById('viewMoreBtn');
const trimmingDropdown = document.getElementById('trimmingDropdown');
const trimmingHistory = document.getElementById('trimmingHistory');

// Trimming data cache
let trimmingData = {
  grandTotal: 0,
  latestEntry: null,
  allEntries: []
};

// Format time helper for trimming
function formatTrimmingTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Format time window for display
function formatTimeWindow(startMs, endMs) {
  if (!startMs || !endMs) return '—';
  const start = new Date(startMs).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  const end = new Date(endMs).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  return `${start} - ${end}`;
}

// Fetch trimming data from hourly reports
async function fetchTrimmingData() {
  if (!lastUser) return;
  
  try {
    const today = ymd(new Date());
    
    // Query hourly reports for trimming category
    const q = query(
      collection(db, 'hourlyReports'),
      where('userId', '==', lastUser.uid),
      where('ymd', '==', today),
      where('category', '==', 'trimming')
    );
    
    const snapshot = await getDocs(q);
    
    let totalSeconds = 0;
    const entries = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const reportedSec = Number(data.reportedSec || 0);
      const startMs = data.blockStartMs || data.hourStartMs;
      const endMs = data.blockEndMs || data.hourEndMs;
      const submittedAt = data.createdAt;
      
      totalSeconds += reportedSec;
      
      entries.push({
        duration: reportedSec,
        startMs: startMs,
        endMs: endMs,
        submittedAt: submittedAt,
        timeWindow: formatTimeWindow(startMs, endMs)
      });
    });
    
    // Sort entries by submission time (most recent first)
    entries.sort((a, b) => {
      const aTime = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt || 0);
      const bTime = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt || 0);
      return bTime - aTime;
    });
    
    trimmingData = {
      grandTotal: totalSeconds,
      latestEntry: entries[0] || null,
      allEntries: entries
    };
    
    updateTrimmingDisplay();
    
  } catch (error) {
    console.error('Error fetching trimming data:', error);
  }
}

// Update trimming section display
function updateTrimmingDisplay() {
  if (!trimmingSection) return;
  
  // Update grand total
  if (grandTrimmingTime) {
    grandTrimmingTime.textContent = formatTrimmingTime(trimmingData.grandTotal);
  }
  
  // Update latest entry
  if (latestTrimmingTime && latestTrimmingWindow) {
    if (trimmingData.latestEntry) {
      latestTrimmingTime.textContent = formatTrimmingTime(trimmingData.latestEntry.duration);
      latestTrimmingWindow.textContent = `(Time Window: ${trimmingData.latestEntry.timeWindow})`;
    } else {
      latestTrimmingTime.textContent = '00:00:00';
      latestTrimmingWindow.textContent = '(Time Window: —)';
    }
  }
}

// Toggle dropdown visibility
function toggleTrimmingDropdown() {
  if (!trimmingDropdown) return;
  
  const isVisible = trimmingDropdown.classList.contains('show');
  
  if (isVisible) {
    trimmingDropdown.classList.remove('show');
    trimmingDropdown.style.display = 'none';
    if (viewMoreBtn) viewMoreBtn.textContent = 'View More';
  } else {
    trimmingDropdown.style.display = 'block';
    setTimeout(() => {
      trimmingDropdown.classList.add('show');
    }, 10);
    if (viewMoreBtn) viewMoreBtn.textContent = 'View Less';
    renderTrimmingHistory();
  }
}

// Render trimming history in dropdown
function renderTrimmingHistory() {
  if (!trimmingHistory) return;
  
  if (trimmingData.allEntries.length === 0) {
    trimmingHistory.innerHTML = '<div class="no-data-text">No trimming entries found for today.</div>';
    return;
  }
  
  let html = '';
  trimmingData.allEntries.forEach(entry => {
    html += `
      <div class="trimming-entry">
        <span class="trimming-entry-time">${entry.timeWindow}</span>
        <span class="trimming-entry-duration">${formatTrimmingTime(entry.duration)}</span>
      </div>
    `;
  });
  
  trimmingHistory.innerHTML = html;
}

// Set up trimming section event listeners
function initTrimmingSection() {
  if (viewMoreBtn) {
    viewMoreBtn.addEventListener('click', toggleTrimmingDropdown);
  }
  
  // Initial data fetch
  if (lastUser) {
    fetchTrimmingData();
  }
}

// Listen for new hourly reports to update trimming data
function listenForTrimmingUpdates() {
  if (!lastUser) return;
  
  const today = ymd(new Date());
  const q = query(
    collection(db, 'hourlyReports'),
    where('userId', '==', lastUser.uid),
    where('ymd', '==', today),
    where('category', '==', 'trimming')
  );
  
  return onSnapshot(q, (snapshot) => {
    fetchTrimmingData();
  }, (error) => {
    console.error('Error listening for trimming updates:', error);
  });
}

// Initialize trimming section when user is authenticated
let trimmingUnsubscribe = null;

// Hook into existing auth state change to initialize trimming and productivity chart
const initTrimmingOnAuth = () => {
  if (lastUser) {
    setTimeout(() => {
      initTrimmingSection();
      if (trimmingUnsubscribe) trimmingUnsubscribe();
      trimmingUnsubscribe = listenForTrimmingUpdates();
      
      // Initialize productivity comparison chart
      if (window.initProductivityChart) {
        window.initProductivityChart();
      }
    }, 1000);
  } else {
    // User logged out, cleanup
    if (trimmingUnsubscribe) {
      trimmingUnsubscribe();
      trimmingUnsubscribe = null;
    }
    if (window.cleanupProductivityChart) {
      window.cleanupProductivityChart();
    }
  }
};

// Add trimming and productivity chart initialization to existing auth listener
try {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      initTrimmingOnAuth();
    } else {
      if (trimmingUnsubscribe) {
        trimmingUnsubscribe();
        trimmingUnsubscribe = null;
      }
      if (window.cleanupProductivityChart) {
        window.cleanupProductivityChart();
      }
    }
  });
} catch (e) {
  console.warn('Trimming and productivity chart auth listener setup failed', e);
}

// Trimming data will be updated via the hourly report submission hook above

/* =================== END TRIMMING SECTION FUNCTIONALITY =================== */

/* ===================== PRODUCTIVITY COMPARISON CHART FUNCTIONALITY ===================== */

// The productivity comparison chart is now handled by the external productivity-chart.js module
// This section is kept for compatibility but the actual chart logic is in productivity-chart.js

/* =================== END PRODUCTIVITY COMPARISON CHART FUNCTIONALITY =================== */

/* Final log to indicate renderer init completed */
console.info('renderer/app.js: initialization complete.');

// Productivity chart auto-refresh is handled by the productivity-chart.js module

// Ensure UserProfileManager gets Firebase user data
setTimeout(() => {
  if (window.userProfileManager && window.lastUser) {
    window.userProfileManager.updateFromFirebase();
  }
}, 2000);

// Force initialize productivity chart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, checking for chart container');
  const container = document.getElementById('productivityChartContainer');
  if (container) {
    console.log('Chart container found, initializing...');
    setTimeout(() => {
      try {
        if (window.ProductivityChart) {
          window.productivityChart = new window.ProductivityChart('productivityChartContainer');
          window.productivityChart.startLiveUpdates();
          window.productivityChart.setVisibility(true);
          console.log('Productivity chart force-initialized');
        }
      } catch (e) {
        console.error('Force init failed:', e);
      }
    }, 2000);
  }
});

// Initialize trimming section and productivity chart after a delay to ensure DOM is ready
setTimeout(() => {
  if (lastUser) {
    initTrimmingSection();
    if (trimmingUnsubscribe) trimmingUnsubscribe();
    trimmingUnsubscribe = listenForTrimmingUpdates();
    
    // Initialize productivity comparison chart
    if (window.initProductivityChart) {
      window.initProductivityChart();
    }
  }
}, 3000);
