// renderer/admin-phases.js
// Shows a live grid of active user phases and ticking durations.
// Requires the same ./firebase.js module you use in admin.js
import { db, collection, onSnapshot } from './firebase.js';

function safeOnSnapshot(ref, next, label){
  try{ return onSnapshot(ref, next, (err)=>{ try{ console.warn((label?label+' ':'') + 'onSnapshot error', err); }catch(_){} }); }
  catch(e){ console.warn((label?label+' ':'') + 'onSnapshot setup failed', e); return ()=>{}; }
}
/* Helpers (self-contained) */
function fmtSec(sec){
  sec = Number(sec) || 0;
  const h = String(Math.floor(sec/3600)).padStart(2,'0');
  const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
  const s = String(Math.floor(sec%60)).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function anyToMs(v){
  if(!v && v !== 0) return 0;
  try{
    if (typeof v === 'number') return v > 1e11 ? v : v*1000;
    if (typeof v === 'string'){
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    if (typeof v === 'object'){
      if (typeof v.seconds === 'number') return v.seconds*1000 + Math.floor((v.nanoseconds||0)/1e6);
      if ('_seconds' in v) return (v._seconds||0)*1000;
      if ('ms' in v) return v.ms;
      if (v && typeof v.toMillis === 'function') return Number(v.toMillis());
      if (v && typeof v.toDate === 'function') return v.toDate().getTime();
    }
  }catch(e){ console.warn('anyToMs parse', e); }
  return 0;
}
/* DOM */
const phaseGrid = document.getElementById('phaseGrid');
const phaseCount = document.getElementById('phaseCount');
if (!phaseGrid || !phaseCount) {
  // nothing to do if markup missing
  console.warn('admin-phases: #phaseGrid or #phaseCount not found');
} else {
  let usersMap = {}; // uid -> { displayName, email }
  const timers = new Map(); // docId -> intervalId
  // keep a local users map (lightweight)
  const usersRef = collection(db, 'users');
  try {
    safeOnSnapshot(usersRef, (snap)=>{
      const m = {};
      snap.forEach(d=> m[d.id] = d.data());
      usersMap = m;
    }, 'admin-phases users');
  } catch(e){
    console.warn('admin-phases: users snapshot failed', e);
  }
  // Render helper
  function renderPhaseGrid(sessions){
    // sessions: array of { id, uid, type, startMs }
    // group by type for nicer cards, but we will render a card per user
    phaseGrid.innerHTML = '';
    if (!sessions.length) {
      phaseGrid.innerHTML = `<div style="grid-column: 1 / -1; color: var(--muted)">No active sessions right now.</div>`;
      phaseCount.textContent = '0 active';
      // cleanup timers
      timers.forEach((iid, k)=>{ try{ clearInterval(iid); }catch{}; timers.delete(k); });
      return;
    }
    phaseCount.textContent = `${sessions.length} active`;
    sessions.forEach(s => {
      const docId = s.id;
      const uid = s.uid || s.userId || docId;
      const type = String(s.type || '').toUpperCase() || '—';
      const startMs = anyToMs(s.startMs) || Date.now();
      // card container
      const card = document.createElement('div');
      card.className = 'phase-card';
      // generate stable ids so we can update timers
      const timerId = `phase-timer-${docId}`;
      const displayName = (usersMap[uid] && (usersMap[uid].displayName || usersMap[uid].email)) || uid;
      card.innerHTML = `
        <div class="phase-card-head">
          <div>
            <div class="phase-card-title">${escapeHtml(displayName)}</div>
            <div class="phase-card-sub">${escapeHtml(uid)}</div>
          </div>
          <div style="text-align:right">
            <div class="phase-pill">${escapeHtml(type)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="font-size:12px;color:var(--muted)">Started: ${new Date(startMs).toLocaleTimeString()}</div>
          <div id="${timerId}" style="font-weight:700;font-variant-numeric:tabular-nums">${fmtSec(Math.max(0, Math.round((Date.now()-startMs)/1000)))}</div>
        </div>
      `;
      // highlight style for active (match admin.css theme)
      card.style.border = '1px solid var(--border)';
      card.style.background = 'rgba(0,0,0,0.15)';
      // add to grid
      phaseGrid.appendChild(card);
      // start/replace timer
      if (timers.has(docId)){
        try{ clearInterval(timers.get(docId)); }catch(_){}
        timers.delete(docId);
      }
      const iid = setInterval(()=>{
        const el = document.getElementById(timerId);
        if(!el) { clearInterval(iid); timers.delete(docId); return; }
        const now = Date.now();
        const sec = Math.max(0, Math.round((now - startMs)/1000));
        el.textContent = fmtSec(sec);
      }, 1000);
      timers.set(docId, iid);
      // visual grace: when phase is WORK or similar, add class
      const cls = type.toLowerCase();
      if (cls === 'work') {
        card.classList.add('phase-card-work');
        card.style.borderColor = 'var(--phase-active-border)';
        card.style.background = 'linear-gradient(180deg, rgba(16,185,129,0.06), rgba(0,0,0,0.12))';
      }
    });
  }
  // Listen to activeSessions (real-time)
  try {
    const activeRef = collection(db, 'activeSessions');
    safeOnSnapshot(activeRef, (snap) => {
      const sessions = [];
      const seenIds = new Set();
      snap.forEach(d => {
        const data = d.data() || {};
        const id = d.id;
        const uid = data.userId || data.uid || data.user || id;
        const type = data.type || data.phase || '';
        const startMs = data.startMs ?? data.startAt ?? data.start ?? data.ts ?? data.createdAt ?? null;
        sessions.push({ id, uid, type, startMs });
        seenIds.add(id);
      });
      // cleanup timers for docs removed
      Array.from(timers.keys()).forEach(id => {
        if (!seenIds.has(id)) {
          try{ clearInterval(timers.get(id)); }catch(_){}
          timers.delete(id);
        }
      });
      renderPhaseGrid(sessions);
    });
  } catch (e) {
    console.warn('admin-phases: activeSessions snapshot failed', e);
  }
}
/* tiny helper to escape HTML (safe since we control content) */
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[c]));
}