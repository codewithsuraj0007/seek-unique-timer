// renderer/admin.js
import {
  auth, onAuthStateChanged, db,
  collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, setDoc, serverTimestamp,
  onSnapshot
} from './firebase.js';


/* ---------------- CONFIG ---------------- */
const ADMIN_EMAILS = ['teamseekunique@gmail.com'];

// Your Slack webhook + Apps Script proxy defaults
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';
const PROXY_BASE    = 'https://script.google.com/macros/s/AKfycbwKdu8s5-9rQWYlGv0l_2sEYAJ2eN33404EcFolemRrIh9Q7zemR2xpzb0O3GsH__1B/exec';
const DEFAULT_PROXY = `${PROXY_BASE}?hook=${encodeURIComponent(SLACK_WEBHOOK)}`;

/* ---------------- DOM ---------------- */
const adminMail      = document.getElementById('adminMail');
const approvalsTbody = document.querySelector('#approvalsTbl tbody') || (() => {
  const sec = document.createElement('section');
  sec.className = 'card';
  sec.innerHTML = `
    <h3>Pending Approvals</h3>
    <table id="approvalsTbl"><thead><tr><th>User</th><th>Type</th><th>Reason</th><th>Action</th></tr></thead><tbody></tbody></table>
  `;
  document.querySelector('.wrap')?.appendChild(sec);
  return sec.querySelector('tbody');
})();

const leaderDiv      = document.getElementById('leader');
const btnStartMeeting= document.getElementById('btnStartMeeting');
const btnStopMeeting = document.getElementById('btnStopMeeting');
const btnSlack       = document.getElementById('btnSlack');
const proxyUrlInp    = document.getElementById('proxyUrl');
const btnSaveProxy   = document.getElementById('btnSaveProxy');

const kpiTbl         = document.getElementById('kpiTbl');
const kpiTblBody     = document.querySelector('#kpiTbl tbody');
const rangeButtons   = [...document.querySelectorAll('.pill')];
const btnExportKPI   = document.getElementById('btnExportKPI');

const attDateInp     = document.getElementById('attDate');
const attUserSel     = document.getElementById('attUser');                // user filter for attendance
const attTblBody     = document.querySelector('#attTbl tbody');
const btnExportAtt   = document.getElementById('btnExportAtt');

const attRecentBox   = document.getElementById('attRecent');            // optional container for "Recent Login"
const attRecentTime  = document.getElementById('attRecentTime');       // optional span to show time
const attHistoryDiv  = document.getElementById('attHistoryContainer'); // div where we show full history

const limitsTbody    = document.querySelector('#limitsTbl tbody');
const btnSaveLimits  = document.getElementById('btnSaveLimits');
const limitsMsg      = document.getElementById('limitsMsg');

// Hourly Reports DOM
const hrDateInp   = document.getElementById('hrDate');
const hrUserSel   = document.getElementById('hrUser');
const hrTblBody   = document.querySelector('#hrTbl tbody');
const btnExportHR = document.getElementById('btnExportHR');

// Create or reuse segment filter dropdown for Hourly Reports
let hrSegmentSel = document.getElementById('hrSegment');
if(!hrSegmentSel){
  hrSegmentSel = document.createElement('select');
  hrSegmentSel.id = 'hrSegment';
  hrSegmentSel.style.marginLeft = '12px';
  // ADDED: include 'Re-Trimming' in the segments list
  const opts = ['All segments','Trimming','Re-Trimming','Layering','Audio','Final Touch Up','Review','Copyright Check'];
  opts.forEach(o=>{
    const el = document.createElement('option');
    el.value = o === 'All segments' ? 'all' : o;
    el.textContent = o;
    hrSegmentSel.appendChild(el);
  });
  if(hrUserSel && hrUserSel.parentNode){
    hrUserSel.parentNode.insertBefore(hrSegmentSel, hrUserSel.nextSibling);
  } else if(hrDateInp && hrDateInp.parentNode){
    hrDateInp.parentNode.insertBefore(hrSegmentSel, hrDateInp.nextSibling);
  } else {
    document.body.insertBefore(hrSegmentSel, document.body.firstChild);
  }
}

/* ---------------- State ---------------- */
let usersMap = {};          // uid -> { displayName, email, photoURL }
let timeLogsSnap = null;    // latest snapshot of timeLogsMaster
let currentRange = 'daily'; // 'daily'|'weekly'|'monthly'
let leaderboardCache = [];  // [{uid, seconds}]
let kpiRowsCache = [];      // for CSV export (array of objects)
let attUnsub = null;

// Productivity Chart instance
let productivityChart = null;

let hrUnsub = null;         // hourly reports live unsub
let hrRowsCache = [];       // hourly rows for CSV

// Targets map: uid -> hourlyTargetSec (number)
let targetsMap = {};        // loaded in renderLimitsTable and on save

// Live active phase (from activeSessions) -> used to highlight KPI cells
const ACTIVE_PHASES = new Map(); // uid -> { type, startMs }

// Per-user live timer intervals for the KPI live-badges
const LIVE_INTERVALS = new Map(); // uid -> { iid, phase }

// Per-user/day attendance history listeners
const attHistUnsubs = new Map(); // key `${uid}:${ymd}` -> unsubscribe fn
const attHistState  = new Map(); // key -> latest combined slices for render

// KPI date inputs
let kpiFromDateInput = null;
let kpiToDateInput   = null;

/* ---------------- Utils ---------------- */
function fmt(sec){
  sec=Number(sec)||0;
  const h=String(Math.floor(sec/3600)).padStart(2,'0');
  const m=String(Math.floor((sec%3600)/60)).padStart(2,'0');
  const s=String(Math.floor(sec%60)).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function ymd(d){
  const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;' }[c]));
}

/* Robust timestamp to local string. Handles many shapes */
function tsToLocal(ts){
  const ms = anyToMs(ts);
  if(!ms) return '';
  try{ return new Date(ms).toLocaleString(); }catch{ return ''; }
}
function msToHMS(ms){
  if(ms==null) return '';
  const sec = Math.max(0, Math.round(ms/1000));
  return fmt(sec);
}
function getRange(kind){
  const end=new Date(); end.setHours(23,59,59,999);
  const start=new Date(end);
  if(kind==='daily'){
    start.setHours(0,0,0,0);
  } else if(kind==='weekly'){
    start.setDate(end.getDate()-6);
    start.setHours(0,0,0,0);
  } else if(kind==='monthly'){
    start.setDate(1);
    start.setHours(0,0,0,0);
  }
  return { start, end };
}
function getNumDaysInRange(kind, refDate){
  const { start, end } = getRange(kind, refDate);
  const msPerDay = 24*60*60*1000;
  return Math.max(1, Math.round((end.setHours(0,0,0,0) - start.setHours(0,0,0,0)) / msPerDay) + 1);
}
function daysBetweenInclusive(fromMs, toMs){
  const msPerDay = 24*60*60*1000;
  const a = new Date(fromMs); a.setHours(0,0,0,0);
  const b = new Date(toMs);   b.setHours(0,0,0,0);
  return Math.max(1, Math.round((b - a)/msPerDay) + 1);
}
function downloadCsv(csv, name){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function csvEscape(v){ return `"${String(v??'').replace(/"/g,'""')}"`; }

/* helper: parse mm:ss or hh:mm:ss into seconds */
function parseHmsToSec(s){
  if(s==null) return 0;
  s = String(s).trim();
  if(!s) return 0;
  const parts = s.split(':').map(p=>p.trim());
  if(parts.length === 1) return Number(parts[0]) || 0;
  if(parts.length === 2){
    const m = Number(parts[0])||0;
    const sec = Number(parts[1])||0;
    return m*60 + sec;
  }
  if(parts.length >= 3){
    const h = Number(parts[0])||0;
    const m = Number(parts[1])||0;
    const sec = Number(parts[2])||0;
    return h*3600 + m*60 + sec;
  }
  return 0;
}

/* ---- robust TS parser for many shapes ---- */
function anyToMs(v){
  if(!v && v !== 0) return 0;
  try{
    if (typeof v === 'number'){
      // assume ms if large, else treat as seconds
      return v > 1e11 ? v : v*1000;
    }
    if (v && typeof v.toMillis === 'function') return Number(v.toMillis());
    if (v && typeof v.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date ? d.getTime() : 0;
    }
    if (typeof v === 'string'){
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    }
    if (typeof v === 'object'){
      if (typeof v.seconds === 'number') return v.seconds*1000 + Math.floor((v.nanoseconds||0)/1e6);
      if ('_seconds' in v) return (v._seconds||0)*1000;
      if ('ms' in v) return v.ms;
    }
  }catch(e){
    console.warn('anyToMs error', e);
  }
  return 0;
}

/* ---------------- Slack + Notifications helpers ---------------- */
async function sendSlackViaProxy(text, extra={}) {
  const proxy = (localStorage.getItem('SLACK_PROXY_URL') || DEFAULT_PROXY).trim();
  if(!proxy) return;
  const payload = { text: typeof text === 'string' ? text : JSON.stringify(text), ...extra };
  // best-effort; we use mode no-cors like your existing code (can't reliably detect response)
  try{
    await fetch(proxy, { method:'POST', mode:'no-cors', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
  }catch(e){
    // swallow - non-critical
    console.warn('Slack proxy send failed', e);
  }
}

async function notifyUserDoc(userId, message){
  try{
    await addDoc(collection(db,'notifications'), { userId, message, read:false, createdAt: serverTimestamp() });
  }catch(e){
    console.warn('notifyUserDoc failed', e);
  }
}

/* --------------- Admin Gate --------------- */
onAuthStateChanged(auth, async (user)=>{
  if(!user || !ADMIN_EMAILS.includes(String(user.email||'').toLowerCase())){
    alert('Admin only'); window.location.href='./login.html'; return;
  }
  adminMail.textContent = user.email || '';

  const today = ymd(new Date());
  if(attDateInp) attDateInp.value = today;
  if(hrDateInp)  hrDateInp.value  = today;

  initProxyField();

  liveUsers();
  liveApprovals();
  liveExitRequests();
  liveTimeLogs();
  
  // Debug: Test exit requests collection
  setTimeout(async () => {
    try {
      const testQuery = query(collection(db, 'exit_requests'));
      const testSnap = await getDocs(testQuery);
      console.log('Total exit requests in database:', testSnap.size);
      testSnap.forEach(doc => {
        console.log('Exit request:', doc.id, doc.data());
      });
    } catch(e) {
      console.error('Error testing exit requests:', e);
    }
  }, 2000);
  liveActiveSessionsForKPI();
  renderLimitsTable();

  installKpiDateRangeControls();
  ensureKpiHeaderHasProductivity();

  // Attendance
  if(attDateInp){
    liveAttendance(attDateInp.value, attUserSel?.value || 'all');
    attDateInp.addEventListener('change', ()=> liveAttendance(attDateInp.value, attUserSel?.value || 'all') );
  }

  if(attUserSel){
    attUserSel.addEventListener('change', ()=> liveAttendance(attDateInp?.value || ymd(new Date()), attUserSel.value || 'all') );
  }

  // Hourly reports
  if(hrDateInp && hrUserSel){
    populateUserFilter();
    liveHourly(hrDateInp.value, hrUserSel.value);
    hrDateInp.addEventListener('change', ()=> liveHourly(hrDateInp.value, hrUserSel.value) );
    hrUserSel.addEventListener('change', ()=> liveHourly(hrDateInp.value, hrUserSel.value) );
    hrSegmentSel.addEventListener('change', ()=> liveHourly(hrDateInp.value, hrUserSel.value) );
  }
});

/* --------------- Users map live --------------- */
function liveUsers(){
  onSnapshot(collection(db,'users'), (snap)=>{
    const m = {};
    snap.forEach(d=> m[d.id] = d.data());
    usersMap = m;

    // Re-populate user filter in hourly reports
    populateUserFilter();

    // Re-populate attendance user filter too
    populateAttUserFilter();

    // Re-render derived tables
    if(timeLogsSnap){
      renderKPI();
      renderLeaderboard();
      // Re-apply KPI highlight based on live active phases
      applyActivePhaseHighlightToKPI();
    }

    // names in limits table
    renderLimitsTable();
  });
}
function populateUserFilter(){
  if(!hrUserSel) return;
  const current = hrUserSel.value || 'all';
  hrUserSel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'All users';
  hrUserSel.appendChild(optAll);
  Object.keys(usersMap).sort((a,b)=>{
    const an = (usersMap[a]?.displayName || a).toLowerCase();
    const bn = (usersMap[b]?.displayName || b).toLowerCase();
    return an.localeCompare(bn);
  }).forEach(uid=>{
    const o = document.createElement('option');
    o.value = uid;
    o.textContent = usersMap[uid]?.displayName || uid;
    hrUserSel.appendChild(o);
  });
  // restore selected value if possible
  const want = [...hrUserSel.options].find(o=>o.value===current) ? current : 'all';
  hrUserSel.value = want;
}

/* NEW: populate attendance user dropdown to match style of hrUser */
function populateAttUserFilter(){
  if(!attUserSel) return;
  const current = attUserSel.value || 'all';
  attUserSel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'All users';
  attUserSel.appendChild(optAll);
  Object.keys(usersMap).sort((a,b)=>{
    const an = (usersMap[a]?.displayName || a).toLowerCase();
    const bn = (usersMap[b]?.displayName || b).toLowerCase();
    return an.localeCompare(bn);
  }).forEach(uid=>{
    const o = document.createElement('option');
    o.value = uid;
    o.textContent = usersMap[uid]?.displayName || uid;
    attUserSel.appendChild(o);
  });
  const want = [...attUserSel.options].find(o=>o.value===current) ? current : 'all';
  attUserSel.value = want;
}

/* --------------- Exit Requests (Pending Approvals) --------------- */
function liveExitRequests(){
  console.log('Setting up live exit requests listener...');
  const qExitReq = query(collection(db,'exit_requests'), where('status','==','pending'));
  onSnapshot(qExitReq, (snap)=>{
    console.log('Exit requests snapshot received:', snap.size, 'documents');
    const tbody = document.querySelector('#approvalsTbl tbody');
    if (!tbody) {
      console.error('Approvals table body not found!');
      return;
    }
    
    tbody.innerHTML='';
    if(snap.empty){
      tbody.innerHTML = `<tr><td colspan="5">No pending exit requests.</td></tr>`;
      return;
    }
    
    snap.forEach(d=>{
      const x=d.data();
      console.log('Processing exit request:', d.id, x);
      const name = x.username || usersMap[x.user_id]?.displayName || x.user_id || 'Unknown';
      const tr=document.createElement('tr');
      
      const reason = x.reason ? escapeHtml(String(x.reason).slice(0,120)) : 'No reason provided';
      const timeStr = x.submitted_time || (x.created_at ? tsToLocal(x.created_at) : 'Unknown time');
      
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>Exit Request</td>
        <td style="max-width:420px; white-space:pre-wrap;">${reason}</td>
        <td>${escapeHtml(timeStr)}</td>
        <td>
          <button data-id="${d.id}" data-action="approve" title="Approve and close user session" style="background:linear-gradient(135deg,#10b981,#059669); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; margin-right:6px;">Approve</button>
          <button data-id="${d.id}" data-action="reject" title="Reject — keep user session running" style="background:linear-gradient(135deg,#ef4444,#dc2626); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">Reject</button>
        </td>`;
      tbody.appendChild(tr);
      console.log('Added exit request row for:', name);
    });

    // Delegate click handling
    tbody.onclick = async (e)=>{
      const btn=e.target.closest('button'); if(!btn) return;
      const id=btn.dataset.id, action=btn.dataset.action;
      if(!id || !action) return;
      await handleExitRequestAction(id, action);
    };
  });
}

/* Handle exit request approval/rejection */
async function handleExitRequestAction(requestId, action) {
  try {
    const requestRef = doc(db, 'exit_requests', requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      alert('Request not found.');
      return;
    }
    
    const requestData = requestSnap.data();
    const userId = requestData.user_id;
    const username = requestData.username || 'Unknown User';
    const reason = requestData.reason || 'No reason provided';
    const submittedTime = requestData.submitted_time || 'Unknown time';
    
    console.log('Processing exit request:', {
      action,
      username,
      reason,
      submittedTime,
      userId
    });
    
    if (action === 'approve') {
      // Check if already approved (idempotent)
      if (requestData.status === 'approved') {
        alert(`Exit request for ${username} is already approved.`);
        return;
      }
      
      // Mark request as approved
      await updateDoc(requestRef, {
        status: 'approved',
        acted_by: auth.currentUser?.uid || 'admin',
        acted_at: serverTimestamp(),
        admin_action_time: new Date().toLocaleString()
      });
      
      // Notify user
      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        message: `Your exit request was approved by admin. Reason: "${reason}". Your session is now closed.`,
        type: 'exit_approved',
        read: false,
        createdAt: serverTimestamp()
      });
      
      // Run existing close/save workflow by creating a logout entry
      // This calls the same workflow as normal day-end logout
      await addDoc(collection(db, 'timeLogsMaster'), {
        userId: userId,
        type: 'logout',
        duration: 0,
        startedAtMs: Date.now(),
        stoppedAt: serverTimestamp(),
        ymd: ymd(new Date()),
        exitReason: reason,
        approvedBy: 'admin'
      });
      
      // Also add to user's personal logs for consistency
      try {
        await addDoc(collection(db, 'userTimeLogs', userId, 'logs'), {
          userId: userId,
          type: 'logout',
          duration: 0,
          startedAtMs: Date.now(),
          stoppedAt: serverTimestamp(),
          ymd: ymd(new Date()),
          exitReason: reason,
          approvedBy: 'admin'
        });
      } catch(e) {
        console.warn('Failed to add logout to user logs', e);
      }
      
      alert(`✅ Exit request APPROVED for ${username}\n\nReason: "${reason}"\nSubmitted: ${submittedTime}\n\nUser session will be closed.`);
      
    } else if (action === 'reject') {
      // Mark request as rejected
      await updateDoc(requestRef, {
        status: 'rejected',
        acted_by: auth.currentUser?.uid || 'admin',
        acted_at: serverTimestamp(),
        admin_action_time: new Date().toLocaleString()
      });
      
      // Notify user
      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        message: `Your exit request was rejected by admin. Reason for exit: "${reason}". Your session continues.`,
        type: 'exit_rejected',
        read: false,
        createdAt: serverTimestamp()
      });
      
      alert(`❌ Exit request REJECTED for ${username}\n\nReason: "${reason}"\nSubmitted: ${submittedTime}\n\nUser session continues.`);
    }
    
  } catch (error) {
    console.error('Error handling exit request:', error);
    alert('Failed to process request. Please try again.');
  }
}

/* --------------- Legacy Approvals (keep existing) --------------- */
function liveApprovals(){
  console.log('Setting up live approvals listener...');
  const qAppr = query(collection(db,'approvals'), where('status','==','pending'));
  onSnapshot(qAppr, (snap)=>{
    console.log('Approvals snapshot received:', snap.size, 'documents');
    // Handle legacy approvals (break requests, lunch skip requests, etc.)
    // Don't interfere with exit requests which are handled separately
    
    // Find or create approvals table body for legacy approvals
    let legacyTbody = document.querySelector('#legacyApprovalsTbl tbody');
    if (!legacyTbody) {
      // Create a separate section for legacy approvals if it doesn't exist
      const legacySection = document.createElement('section');
      legacySection.className = 'card';
      legacySection.style.gridColumn = '1/-1';
      legacySection.innerHTML = `
        <h3>Other Pending Approvals (Break/Lunch Skip)</h3>
        <table id="legacyApprovalsTbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Time</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      
      // Insert after the main approvals section
      const mainApprovals = document.querySelector('#approvalsTbl')?.closest('section');
      if (mainApprovals && mainApprovals.parentNode) {
        mainApprovals.parentNode.insertBefore(legacySection, mainApprovals.nextSibling);
      } else {
        document.querySelector('.wrap')?.appendChild(legacySection);
      }
      
      legacyTbody = legacySection.querySelector('tbody');
    }
    
    if (!legacyTbody) return;
    
    // Filter out exit requests (they're handled by liveExitRequests)
    const legacyApprovals = [];
    snap.forEach(d => {
      const data = d.data();
      const type = String(data.type || '').toLowerCase();
      console.log('Processing approval:', { id: d.id, type, data });
      if (type !== 'exit-request' && type !== 'exit_request') {
        legacyApprovals.push({ id: d.id, ...data });
      }
    });
    console.log('Filtered legacy approvals:', legacyApprovals.length);
    
    legacyTbody.innerHTML = '';
    
    if (legacyApprovals.length === 0) {
      legacyTbody.innerHTML = `<tr><td colspan="5">No pending break/lunch approvals.</td></tr>`;
      return;
    }
    
    legacyApprovals.forEach(approval => {
      const name = approval.username || usersMap[approval.userId]?.displayName || approval.userId || 'Unknown';
      const type = approval.type || 'Unknown';
      const reason = approval.reason ? escapeHtml(String(approval.reason).slice(0,120)) : '';
      const timeStr = approval.createdAt ? tsToLocal(approval.createdAt) : '';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(type)}</td>
        <td style="max-width:420px; white-space:pre-wrap;">${reason}</td>
        <td>${escapeHtml(timeStr)}</td>
        <td>
          <button data-id="${approval.id}" data-action="approved" title="Approve this request">Approve</button>
          <button data-id="${approval.id}" data-action="rejected" class="btn-danger" style="margin-left:6px" title="Reject this request">Reject</button>
        </td>
      `;
      legacyTbody.appendChild(tr);
    });
    
    // Delegate click handling for legacy approvals
    legacyTbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (!id || !action) return;
      
      await handleApprovalAction(id, action);
    };
  });
}

/* ----------- Approval action handler (Approve / Deny) ----------- */
async function handleApprovalAction(approvalId, action){
  try{
    // Load the approval doc (fresh)
    const apprRef = doc(db,'approvals', approvalId);
    const snap = await getDoc(apprRef);
    if(!snap.exists()){
      alert('Approval not found.');
      return;
    }
    const appr = snap.data() || {};
    const userId = appr.userId || appr.user || 'unknown';
    const type = String(appr.type || '').toLowerCase();

    // Update basic status + admin timestamp
    await updateDoc(apprRef, { status: action, adminAt: serverTimestamp() });

    // If approved, persist session + workReport where applicable
    if(action === 'approved'){
      // 1) Persist session payload to timeLogsMaster (if provided)
      if(appr.session && typeof appr.session === 'object'){
        try{
          // normalize minimal fields expected by timeLogsMaster
          const sessionObj = {
            userId: userId,
            type: appr.session.phase || appr.session.type || 'work',
            duration: Number(appr.session.duration)||0,
            startedAtMs: anyToMs(appr.session.timestamp) || Date.now(),
            meta: appr.session.meta || null,
            createdAt: serverTimestamp()
          };
          await addDoc(collection(db,'timeLogsMaster'), sessionObj);
        }catch(e){
          console.warn('persist session to timeLogsMaster failed', e);
        }
      }

      // 2) Persist workReport (if present) into a dedicated collection for records
      if(appr.workReport){
        try{
          const wr = {
            userId,
            description: appr.workReport.description || appr.workReport.desc || '',
            tasks: appr.workReport.tasks || appr.workReport.tasksCompleted || '',
            createdAt: serverTimestamp(),
            relatedApprovalId: approvalId
          };
          await addDoc(collection(db,'workReports'), wr);
        }catch(e){
          console.warn('saving workReport failed', e);
        }
      }

      // 3) Notify user record in notifications collection
      try{
        await notifyUserDoc(userId, 'Your early-exit request has been APPROVED. The app will close for you.');
      }catch(e){ console.warn('notifyUserDoc failed', e); }

      // 4) Slack message to team with structured payload
      try{
        const text = [
          `:white_check_mark: *Quit Request APPROVED*`,
          `*User:* ${usersMap[userId]?.displayName || userId}`,
          `*Total Time:* ${appr.totalSeconds ? fmt(Number(appr.totalSeconds)) : (appr.total ? appr.total : '—')}`,
          `*Reason:* ${appr.reason || '—'}`,
          `*Admin:* ${adminMail.textContent || 'admin'}`,
        ].join('\n');
        await sendSlackViaProxy(text, { attachments: [] });
      }catch(e){ console.warn('Slack notify on approve failed', e); }

      alert('Approved — session persisted (if present) and user notified.');
    } else {
      // DENIED branch
      try{
        await notifyUserDoc(userId, 'Your early-exit request has been REJECTED by Admin. Timer will continue.');
      }catch(e){ console.warn('notifyUserDoc failed', e); }

      try{
        const text = [
          `:x: *Quit Request DENIED*`,
          `*User:* ${usersMap[userId]?.displayName || userId}`,
          `*Reason:* ${appr.reason || '—'}`,
          `*Admin:* ${adminMail.textContent || 'admin'}`,
        ].join('\n');
        await sendSlackViaProxy(text);
      }catch(e){ console.warn('Slack notify on deny failed', e); }

      alert('Request rejected. User will be notified.');
    }
  }catch(err){
    console.error('handleApprovalAction failed', err);
    alert('Action failed — see console for details.');
  }
}

/* --------------- Meeting Broadcast --------------- */
btnStartMeeting?.addEventListener('click', async ()=>{
  await addDoc(collection(db,'signals'), { kind:'meeting', action:'start', at: serverTimestamp() });
  alert('Meeting start signal sent.');
});
btnStopMeeting?.addEventListener('click', async ()=>{
  await addDoc(collection(db,'signals'), { kind:'meeting', action:'stop', at: serverTimestamp() });
  alert('Meeting stop signal sent.');
});

/* --------------- TimeLogs live --------------- */
function liveTimeLogs(){
  onSnapshot(collection(db,'timeLogsMaster'), (snap)=>{
    timeLogsSnap = snap;
    renderKPI();              // now async but fire-and-forget is OK
    renderLeaderboard();
    // After re-render, re-apply highlights
    applyActivePhaseHighlightToKPI();
  });
}

/* --------------- KPI UI helpers --------------- */
function installKpiDateRangeControls(){
  try{
    if(kpiFromDateInput) return;
    const referenceRow = rangeButtons[0]?.parentNode;
    if(!referenceRow) return;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginLeft = '12px';

    const lbl = document.createElement('span');
    lbl.textContent = 'Range:';
    lbl.style.opacity = '0.85';
    lbl.style.fontSize = '13px';

    const fromInp = document.createElement('input');
    fromInp.type = 'date';
    fromInp.id = 'kpiFrom';
    fromInp.title = 'From (inclusive)';
    fromInp.style.padding = '6px';
    fromInp.style.borderRadius = '8px';

    const toInp = document.createElement('input');
    toInp.type = 'date';
    toInp.id = 'kpiTo';
    toInp.title = 'To (inclusive)';
    toInp.style.padding = '6px';
    toInp.style.borderRadius = '8px';

    wrapper.appendChild(lbl);
    wrapper.appendChild(fromInp);
    wrapper.appendChild(toInp);

    referenceRow.appendChild(wrapper);

    kpiFromDateInput = fromInp;
    kpiToDateInput   = toInp;

    const onChange = ()=> renderKPI();
    fromInp.addEventListener('change', onChange);
    toInp.addEventListener('change', onChange);
  }catch(e){ console.warn('installKpiDateRangeControls failed', e); }
}

function ensureKpiHeaderHasProductivity(){
  try{
    const thead = kpiTbl?.querySelector('thead tr');
    if(!thead) return;
    const existing = [...thead.children].map(th=>th.textContent.trim().toLowerCase()).includes('productivity');
    if(existing) return;
    let grandIdx = -1;
    [...thead.children].forEach((th,i)=>{ if((th.textContent||'').trim().toLowerCase().includes('grand')) grandIdx = i; });
    const th = document.createElement('th'); th.textContent = 'Productivity';
    if(grandIdx >= 0) thead.insertBefore(th, thead.children[grandIdx]);
    else thead.appendChild(th);
  }catch(e){ console.warn('ensureKpiHeaderHasProductivity failed', e); }
}

function resolveKpiDateRange(){
  try{
    if(kpiFromDateInput && kpiFromDateInput.value && kpiToDateInput && kpiToDateInput.value){
      const from = new Date(kpiFromDateInput.value); from.setHours(0,0,0,0);
      const to   = new Date(kpiToDateInput.value);   to.setHours(23,59,59,999);
      const numDays = daysBetweenInclusive(from.getTime(), to.getTime());
      return { fromMs: from.getTime(), toMs: to.getTime(), numDays, isRange:true };
    }
  }catch(e){ console.warn('resolveKpiDateRange parse error', e); }
  const { start, end } = getRange(currentRange);
  return { fromMs: start.getTime(), toMs: end.getTime(), numDays: getNumDaysInRange(currentRange), isRange:false };
}

/* ----------------- NEW HELPER -----------------
   Try to find a human display name for a uid by searching:
   1) usersMap (preferred)
   2) hourlyReports index (hrIndex) for fields name/displayName/userName
   3) timeLogs (tlIndex) for fields name/displayName/userName
*/
function findDisplayNameForUid(uid, hrIndex, tlIndex){
  if(!uid) return uid;
  if(usersMap && usersMap[uid] && (usersMap[uid].displayName || usersMap[uid].name)) return usersMap[uid].displayName || usersMap[uid].name;

  // search hourlyReports index for name-like fields
  try{
    if(hrIndex && hrIndex[uid]){
      const days = Object.keys(hrIndex[uid]);
      for(const d of days){
        const arr = hrIndex[uid][d] || [];
        for(const doc of arr){
          const cand = doc.displayName || doc.name || doc.userName || doc.userNameDisplay || doc.userDisplayName;
          if(cand) return cand;
        }
      }
    }
  }catch(e){ /* ignore */ }

  // search timeLogs fallback index
  try{
    if(tlIndex && tlIndex[uid]){
      const days = Object.keys(tlIndex[uid]);
      for(const d of days){
        const arr = tlIndex[uid][d] || [];
        for(const entry of arr){
          // some timeLogs may carry meta or userName fields
          const cand = (entry.meta && (entry.meta.displayName || entry.meta.name || entry.meta.userName)) || entry.displayName || entry.name;
          if(cand) return cand;
        }
      }
    }
  }catch(e){ /* ignore */ }

  return uid; // final fallback to UID
}

/* --------------- KPI (main) --------------- */
/* ----- REPLACED renderKPI() - robust union of sources so any user that appears anywhere will show ----- */
async function renderKPI(){
  ensureKpiHeaderHasProductivity();
  if(!timeLogsSnap) {
    if(kpiTblBody) kpiTblBody.innerHTML = `<tr><td colspan="12" class="muted">Loading KPI…</td></tr>`;
    return;
  }

  const rangeSpec = resolveKpiDateRange();
  const fromMs = rangeSpec.fromMs;
  const toMs = rangeSpec.toMs;
  const numDays = Math.max(1, rangeSpec.numDays || 1);
  const isCustomRange = !!rangeSpec.isRange;

  // 1) Load hourlyReports in date range (preferred source)
  let hrDocs = [];
  try{
    const q = query(collection(db,'hourlyReports'), where('blockStartMs','>=', fromMs), where('blockStartMs','<=', toMs));
    const snaps = await getDocs(q);
    snaps.forEach(d=>{ const x=d.data()||{}; x._id=d.id; hrDocs.push(x); });
  }catch(e){
    try{
      const q2 = query(collection(db,'hourlyReports'), where('ymd','>=', new Date(fromMs).toISOString().slice(0,10)), where('ymd','<=', new Date(toMs).toISOString().slice(0,10)));
      const snaps2 = await getDocs(q2);
      snaps2.forEach(d=>{ const x=d.data()||{}; x._id=d.id; hrDocs.push(x); });
    }catch(e2){
      console.warn('Failed to fetch hourlyReports for KPI (fallback)', e2);
    }
  }

  const hrIndex = {};
  hrDocs.forEach(x=>{
    const uid = x.userId || x.user || 'unknown';
    const startMs = (x.blockStartMs ?? x.hourStartMs) || 0;
    const ms = Number(startMs) || anyToMs(x.createdAt) || 0;
    const d = new Date(ms);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    hrIndex[uid] = hrIndex[uid] || {};
    hrIndex[uid][dayKey] = hrIndex[uid][dayKey] || [];
    hrIndex[uid][dayKey].push(x);
  });

  // 2) Build fallback timeLogs index (per-user/day)
  const tlIndex = {};
  try{
    timeLogsSnap.forEach(d=>{
      const x = d.data() || {};
      const startMsCandidate = x.startedAtMs ?? x.startedAt ?? x.createdAt ?? x.startedAtTimestamp ?? null;
      const startedAtMs = anyToMs(startMsCandidate);
      if(!startedAtMs) return;
      if(startedAtMs < fromMs || startedAtMs > toMs) return;
      const uid = x.userId || x.uid || x.user || 'unknown';
      const sec = Number(x.duration ?? x.durationSec ?? x.seconds ?? x.dur ?? 0) || 0;
      const dObj = new Date(startedAtMs);
      const dayKey = `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;
      tlIndex[uid] = tlIndex[uid] || {};
      tlIndex[uid][dayKey] = tlIndex[uid][dayKey] || [];
      tlIndex[uid][dayKey].push({ type: String(x.type||'').toLowerCase(), sec, startedAtMs, meta: x.meta || {}, displayName: x.displayName || x.name || null });
    });
  }catch(e){ console.warn('timeLogs indexing failed', e); }

  // 3) Build set of uids from all useful sources so no active/valid user is missed
  const uidsSet = new Set();

  // a) add all known users from usersMap
  Object.keys(usersMap || {}).forEach(u=> uidsSet.add(u));

  // b) add all uids seen in hourlyReports and timeLogs
  Object.keys(hrIndex).forEach(u=> uidsSet.add(u));
  Object.keys(tlIndex).forEach(u=> uidsSet.add(u));

  // c) add users from activeSessions (so live users appear immediately)
  try{
    for(const uid of ACTIVE_PHASES.keys()) uidsSet.add(uid);
  }catch(e){ /* ignore */ }

  // d) Add uids from attendance for the date (only if daily and not custom-range we still use date filter, but include these regardless)
  try{
    const ymdStr = new Date(fromMs).toISOString().slice(0,10);
    const q = query(collection(db,'attendance'), where('ymd','==', ymdStr));
    const snap = await getDocs(q);
    snap.forEach(d=>{
      const data = d.data() || {};
      const uid = data.userId || data.uid || d.id;
      if(uid) uidsSet.add(uid);
    });
  }catch(e){
    console.warn('Failed to fetch attendance for KPI union', e);
  }

  // e) As last resort, if usersMap is empty (e.g. you deleted users collection), try to populate from timeLogs or hourlyReports doc fields meta/userName
  if(uidsSet.size === 0){
    try{
      timeLogsSnap.forEach(d=>{
        const x = d.data()||{};
        const uid = x.userId || x.uid || x.user || null;
        if(uid) uidsSet.add(uid);
      });
      hrDocs.forEach(x=>{
        const uid = x.userId || x.user || x.uid || null;
        if(uid) uidsSet.add(uid);
      });
    }catch(e){/* ignore */ }
  }

  // 4) Attendance filter: for daily view keep filtering but never exclude uids if they are known via usersMap, timeLogs, hourlyReports, or activeSessions
  let attendanceUids = null;
  if(currentRange === 'daily' && !isCustomRange){
    try{
      const ymdStr = new Date(fromMs).toISOString().slice(0,10);
      const q = query(collection(db,'attendance'), where('ymd','==', ymdStr));
      const snap = await getDocs(q);
      const s = new Set();
      snap.forEach(d=>{
        const data = d.data() || {};
        const uid = data.userId || data.uid || d.id;
        if(uid) s.add(uid);
      });
      attendanceUids = s;
    }catch(e){
      console.warn('failed to fetch attendance for day filter', e);
      attendanceUids = null;
    }
  }

  // 5) Build result rows by iterating uidsSet but respecting the "never-exclude" rule
  const startDate = new Date(fromMs); startDate.setHours(0,0,0,0);
  const rows = [];

  for(const uid of uidsSet){
    // If attendanceUids is present AND the uid is not in attendanceUids,
    // allow this uid only if:
    //  - they exist in usersMap (registered user), OR
    //  - they have any timeLogs in tlIndex, OR
    //  - they have hourlyReports in hrIndex, OR
    //  - they have an active session
    if(attendanceUids && attendanceUids.size){
      const hasUsersMap = usersMap && !!usersMap[uid];
      const hasTl = tlIndex[uid] && Object.keys(tlIndex[uid]).length > 0;
      const hasHr = hrIndex[uid] && Object.keys(hrIndex[uid]).length > 0;
      const hasActive = ACTIVE_PHASES.has(uid);
      if(!attendanceUids.has(uid) && !hasUsersMap && !hasTl && !hasHr && !hasActive){
        continue; // still exclude true strangers for the date (keeps daily filter behavior)
      }
    }

    // Resolve display name (prefer usersMap, fallback to hr/tl metadata)
    const name = findDisplayNameForUid(uid, hrIndex, tlIndex) || uid;
    const targetSec = Number(targetsMap[uid] || 0);

    // per-day cumulative percentages array
    const dayTotals = [];

    for(let i=0;i<numDays;i++){
      const d = new Date(startDate.getTime() + i*24*3600*1000);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      let dayCumulativePct = 0;

      // prefer hourlyReports
      const reports = (hrIndex[uid] && hrIndex[uid][dayKey]) ? hrIndex[uid][dayKey] : [];
      if(reports && reports.length){
        reports.forEach(r=>{
          const segment = (r.segment || r.category || '') || '';
          const reportedSec = Number(r.reportedSec || r.reported || r.reportedSeconds || 0) || 0;
          const isTrimming = String(segment||'').toLowerCase() === 'trimming';
          const windowSec = (r.blockStartMs && r.blockEndMs) ? Math.max(1, Math.round((anyToMs(r.blockEndMs) - anyToMs(r.blockStartMs))/1000)) : (r.windowSec || 3600);

          if(isTrimming){
            const useTarget = targetSec > 0 ? targetSec : windowSec;
            const rawHourPct = useTarget > 0 ? (reportedSec / useTarget) * 100 : 0;
            const hourPct = Math.max(0, Math.min(100, rawHourPct));
            dayCumulativePct += hourPct;
          }
        });
      } else {
        // fallback: use timeLogsMaster per-day trimming sum
        const entries = (tlIndex[uid] && tlIndex[uid][dayKey]) ? tlIndex[uid][dayKey] : [];
        if(entries && entries.length){
          const trimmingSecs = entries.filter(e=> String(e.type||'').toLowerCase() === 'trimming' ).reduce((a,b)=>a+(Number(b.sec)||0),0);
          if(trimmingSecs > 0){
            const useTarget = targetSec > 0 ? targetSec : 3600;
            const rawPct = useTarget > 0 ? (trimmingSecs / useTarget) * 100 : 0;
            const hourPct = Math.max(0, Math.min(100, rawPct));
            dayCumulativePct += hourPct;
          }
        }
      }

      // cap per-day
      dayCumulativePct = Math.max(0, Math.min(100, dayCumulativePct));
      dayTotals.push(dayCumulativePct);
    }

    // compute display pct
    let displayPct = 0;
    if(numDays === 1) displayPct = dayTotals.length ? dayTotals[0] : 0;
    else {
      const sum = dayTotals.reduce((a,b)=>a+(Number(b)||0),0);
      displayPct = dayTotals.length ? (sum / dayTotals.length) : 0;
    }
    displayPct = Math.round(Math.max(0, Math.min(100, displayPct)) * 10) / 10;
    const hasTrimmingData = dayTotals.some(v=> Number(v) > 0);
    const showPct = hasTrimmingData ? displayPct : null;

    // aggregate totals for other columns from tlIndex (summing across day keys present)
    const totals = { work:0, meeting:0, lunch:0, break:0, smm:0, activity:0, copyright:0, other:0, trimming:0, retrimming:0 };
    if(tlIndex[uid]){
      Object.keys(tlIndex[uid]).forEach(dayKey=>{
        tlIndex[uid][dayKey].forEach(it=>{
          const tRaw = String(it.type||'').toLowerCase();
          if(tRaw==='work') totals.work += it.sec;
          else if(tRaw==='meeting') totals.meeting += it.sec;
          else if(tRaw==='lunch') totals.lunch += it.sec;
          else if(tRaw==='break') totals.break += it.sec;
          else if(tRaw==='smm') totals.smm += it.sec;
          else if(tRaw==='activity') totals.activity += it.sec;
          else if(tRaw==='copyright') totals.copyright += it.sec;
          else if(tRaw==='trimming') totals.trimming += it.sec;
          else if(tRaw==='re-trimming' || tRaw==='retrimming' || tRaw==='retrim') totals.retrimming += it.sec;
          else totals.other += it.sec;
        });
      });
    }

    const grand = Object.values(totals).reduce((a,b)=>a+(Number(b)||0),0);

    // ensure active users with no logs still get a zeroed row
    if((!hrIndex[uid] || Object.keys(hrIndex[uid]).length===0) && (!tlIndex[uid] || Object.keys(tlIndex[uid]).length===0)){
      rows.push({ uid, name, totals, grand: 0, prodPct: showPct, targetSec });
    } else {
      rows.push({ uid, name, totals, grand, prodPct: showPct, targetSec });
    }
  }

  // Sort rows by name
  rows.sort((a,b)=> a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  // Render table
  kpiTblBody.innerHTML = '';
  kpiRowsCache = [];

  if(rows.length === 0){
    kpiTblBody.innerHTML = `<tr><td class="muted" colspan="12">No users worked in selected period.</td></tr>`;
    return;
  }

  
rows.forEach(r=>{
  const uid = r.uid;
  const t = r.totals || {};
  const name = r.name || '';

  // Determine number of days in selected range (fallback to 1)
  const daysForAvg = Math.max(1, (typeof numDays !== 'undefined' ? numDays : 1));

  // Compute averaged seconds per day for each KPI (in-place replacement of totals)
  const avg = {
    work: Math.round((t.work || 0) / daysForAvg),
    meeting: Math.round((t.meeting || 0) / daysForAvg),
    lunch: Math.round((t.lunch || 0) / daysForAvg),
    break: Math.round((t.break || 0) / daysForAvg),
    smm: Math.round((t.smm || 0) / daysForAvg),
    activity: Math.round((t.activity || 0) / daysForAvg),
    copyright: Math.round((t.copyright || 0) / daysForAvg),
  };
  avg.grand = Math.round((r.grand || 0) / daysForAvg);

  // Decide productivity percentage to display:
  // Prefer r.prodPct if already available (assumed averaged), otherwise compute from avg.work and standard work hours
  const WORK_HOURS_PER_DAY = Number(localStorage.getItem('WORK_HOURS_PER_DAY')) || 10;
  let prodPctDisplay = null;
  if (r.prodPct !== undefined && r.prodPct !== null) {
    // Only use trimming-based productivity when available
    prodPctDisplay = Number(r.prodPct);
  } else {
    // No trimming productivity available -> keep null so UI shows —
    prodPctDisplay = null;
  }

  // helper to format seconds into HH:MM:SS using existing fmt() if available, otherwise implement simple formatter
  const fmtHms = (typeof fmt === 'function') ? fmt : function(sec){
    sec = Math.max(0, Number(sec)||0);
    const h = Math.floor(sec/3600).toString().padStart(2,'0');
    const m = Math.floor((sec%3600)/60).toString().padStart(2,'0');
    const s = Math.floor(sec%60).toString().padStart(2,'0');
    return `${h}:${m}:${s}`;
  };

  const prodHtml = (prodPctDisplay !== null && prodPctDisplay !== undefined)
    ? `<b>${escapeHtml(String(prodPctDisplay))}%</b><div style="font-size:11px;color:#999;margin-top:4px">Target: ${fmtHms(r.targetSec||0)}</div>`
    : `<span style="color:#9aa2b1">—</span>`;

  // main row: display averages in place of totals
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td data-uid="${uid}" data-col="name">${escapeHtml(name)}</td>

    <td class="kpi-cell" data-uid="${uid}" data-phase="work">
      <div class="kpi-value">${fmtHms(avg.work)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="work" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>

    <td class="kpi-cell" data-uid="${uid}" data-phase="meeting">
      <div class="kpi-value">${fmtHms(avg.meeting)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="meeting" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>
    <td class="kpi-cell" data-uid="${uid}" data-phase="lunch">
      <div class="kpi-value">${fmtHms(avg.lunch)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="lunch" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>
    <td class="kpi-cell" data-uid="${uid}" data-phase="break">
      <div class="kpi-value">${fmtHms(avg.break)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="break" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>
    <td class="kpi-cell" data-uid="${uid}" data-phase="smm">
      <div class="kpi-value">${fmtHms(avg.smm)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="smm" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>
    <td class="kpi-cell" data-uid="${uid}" data-phase="activity">
      <div class="kpi-value">${fmtHms(avg.activity)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="activity" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>
    <td class="kpi-cell" data-uid="${uid}" data-phase="copyright">
      <div class="kpi-value">${fmtHms(avg.copyright)}</div>
      <div class="kpi-live" data-uid="${uid}" data-phase="copyright" style="display:none">● <span class="live-timer">00:00:00</span></div>
    </td>

    <td>
      ${prodHtml}
    </td>

    <td data-uid="${uid}" data-col="total"><b>${fmtHms(avg.grand)}</b></td>
  `;
  kpiTblBody.appendChild(tr);

  // keep for CSV / export: store averaged values (so export reflects averages)
  kpiRowsCache.push([name, avg.work, avg.meeting, avg.lunch, avg.break, avg.smm, avg.activity, avg.copyright, (prodPctDisplay!=null? `${prodPctDisplay}%` : ''), fmtHms(avg.grand)]);
});


  // Apply highlight for any active sessions (live users)
  applyActivePhaseHighlightToKPI();
}
/* ----- end replaced renderKPI() ----- */

/* range buttons behavior: reset custom dates when switching period */
rangeButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(kpiFromDateInput) kpiFromDateInput.value = '';
    if(kpiToDateInput) kpiToDateInput.value = '';

    rangeButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    renderKPI();
    applyActivePhaseHighlightToKPI();
  });
});

/* --------------- Limits --------------- */

async function renderLimitsTable(){
  if(!limitsTbody) return;
  limitsTbody.innerHTML = '';

  // Load limits
  const limitsSnap = await getDocs(collection(db,'limits'));
  const limitsMap = {};
  limitsSnap.forEach(d => limitsMap[d.id] = d.data());

  // Load targets
  targetsMap = {};
  try {
    const tSnap = await getDocs(collection(db,'targets'));
    tSnap.forEach(d => {
      const data = d.data() || {};
      targetsMap[d.id] = Number(data.hourlyTargetSec) || 0;
    });
  } catch(e) {
    console.warn('Failed to load targets collection', e);
  }

  // Combine sources into array
  const combined = [];
  const pushEntry = (uid, displayName) => {
    if(!displayName) return;
    combined.push({
      uid,
      displayName: displayName.trim(),
      limit: limitsMap[uid] || {},
      targetSec: targetsMap[uid] || 0
    });
  };

  // from usersMap
  Object.keys(usersMap || {}).forEach(uid => {
    const user = usersMap[uid] || {};
    pushEntry(uid, user.displayName || user.name || uid);
  });
  // from limits
  Object.keys(limitsMap || {}).forEach(uid => {
    if(!usersMap[uid]) pushEntry(uid, uid);
  });
  // from targets
  Object.keys(targetsMap || {}).forEach(uid => {
    if(!usersMap[uid]) pushEntry(uid, uid);
  });

  // Deduplicate strictly by displayName (case-insensitive)
  const seen = new Set();
  const uniqueList = [];
  for(const e of combined){
    const key = (e.displayName || '').toLowerCase();
    if(!seen.has(key)){
      seen.add(key);
      uniqueList.push(e);
    }
  }

  // Sort alphabetically by displayName
  uniqueList.sort((a,b)=> a.displayName.localeCompare(b.displayName));

  // Render rows
  uniqueList.forEach(u=>{
    const tr = document.createElement('tr');
    tr.dataset.uid = u.uid;
    const pinHtml = `<button class="pin-btn" data-uid="${u.uid}" title="Pin / Unpin">&#9734;</button>`;
    tr.innerHTML = `
      <td style="display:flex;align-items:center">${pinHtml}<span>${escapeHtml(u.displayName)}</span></td>
      <td><input data-uid="${u.uid}" data-k="breakDailyMin" type="number" min="0" placeholder="(none)"
          value="${Number(u.limit.breakDailyMin || '') || ''}" style="width:120px"></td>
      <td><input data-uid="${u.uid}" data-k="smmDailyMin" type="number" min="0" placeholder="(none)"
          value="${Number(u.limit.smmDailyMin || '') || ''}" style="width:120px"></td>
      <td>
        <input data-uid="${u.uid}" data-k="hourlyTarget" type="text" placeholder="mm:ss or hh:mm:ss"
          value="${u.targetSec ? fmt(Number(u.targetSec)) : ''}" style="width:120px">
        <div style="font-size:11px;color:#999;margin-top:4px">Set Trimming Target (MIN:SEC) — applies only to Trimming</div>
      </td>
    `;
    limitsTbody.appendChild(tr);
  });

  // signal pager/pin initializer
  if(window.renderLimitsFinished) window.renderLimitsFinished();
}

btnSaveLimits?.addEventListener('click', async ()=>{
  try{
    const inputs = limitsTbody.querySelectorAll('input[data-uid][data-k]');
    const byUid = {};
    const targetWrites = [];
    inputs.forEach(inp=>{
      const uid = inp.dataset.uid;
      const key = inp.dataset.k;
      const valRaw = inp.value ? inp.value.trim() : '';
      byUid[uid] = byUid[uid] || {};
      if(key === 'hourlyTarget'){
        // We still persist an hourlyTarget per user, but the UI and reports only use it for Trimming.
        if(valRaw){
          const sec = parseHmsToSec(valRaw);
          targetWrites.push({ uid, sec });
          targetsMap[uid] = sec;
        } else {
          targetWrites.push({ uid, sec: 0 });
          targetsMap[uid] = 0;
        }
      } else {
        const val = valRaw ? Number(valRaw) : null;
        if(val!=null && !Number.isNaN(val)) byUid[uid][key]=val;
        else byUid[uid][key]=null;
      }
    });

    const writes = [];
    Object.keys(byUid).forEach(uid=>{
      if(Object.keys(byUid[uid]).length) writes.push(setDoc(doc(db,'limits',uid), byUid[uid], { merge:true }));
    });
    await Promise.all(writes);

    const targWrites = targetWrites.map(t=>{
      return setDoc(doc(db,'targets', t.uid), { hourlyTargetSec: t.sec }, { merge:true });
    });
    await Promise.all(targWrites);

    limitsMsg.textContent = 'Saved ✅';
    setTimeout(()=>limitsMsg.textContent = '', 1800);

    if(hrDateInp) liveHourly(hrDateInp.value, hrUserSel?.value || 'all');
  }catch(e){
    console.error(e); limitsMsg.textContent = 'Save failed';
  }
});

/* --------------- Hourly Reports (live) --------------- */

function liveHourly(dateStr, userId='all'){
  if(!hrTblBody) return;
  if(hrUnsub) hrUnsub();

  // Reset
  hrTblBody.innerHTML = '';
  hrRowsCache = [];

  let qHR = query(collection(db,'hourlyReports'), where('ymd','==', dateStr));
  if(userId && userId!=='all'){
    qHR = query(collection(db,'hourlyReports'),
      where('ymd','==', dateStr),
      where('userId','==', userId)
    );
  }

  hrUnsub = onSnapshot(qHR, (snap)=>{
    hrTblBody.innerHTML = '';
    hrRowsCache = [];

    if(snap.empty){
      hrTblBody.innerHTML = `<tr><td colspan="9" class="muted">No hourly reports.</td></tr>`;
      return;
    }

    // Determine which segment to filter by (dropdown)
    const selectedSegment = (hrSegmentSel && hrSegmentSel.value) ? hrSegmentSel.value : 'all';

    const rows = [];
    snap.forEach(d=>{
      const x = d.data();
      const uid = x.userId;
      const name = usersMap[uid]?.displayName || uid;

      // Segment stored as 'segment' or 'category' depending on your client save; use either
      const segment = x.segment || x.category || ''; // string like 'Trimming' etc

      // If admin has chosen a work-segment filter, apply client-side filter
      if(selectedSegment && selectedSegment !== 'all'){
        if(String(segment || '').toLowerCase() !== String(selectedSegment || '').toLowerCase()){
          return; // skip this row
        }
      }

      const startMs = (x.blockStartMs ?? x.hourStartMs) || null;
      const endMs   = (x.blockEndMs   ?? x.hourEndMs)   || null;
      const hs = startMs ? new Date(startMs) : null;
      const he = endMs   ? new Date(endMs)   : null;

      const windowStr = (hs && he)
        ? `${hs.toLocaleTimeString()} - ${he.toLocaleTimeString()}`
        : '';

      const reported = Number(x.reportedSec)||0;

      // IMPORTANT: Only apply/read target when this row is TRIMMING (case-insensitive)
      const isTrimming = String(segment || '').toLowerCase() === 'trimming';

      // target for this user, in seconds, read from targetsMap only if trimming; fallback to windowSec only for trimming
      const targetFromMap = isTrimming ? (targetsMap[uid] || 0) : 0;
      const windowSec = (hs && he) ? Math.max(1, Math.round((he - hs)/1000)) : 3600;
      const targetSec = isTrimming ? (targetFromMap > 0 ? targetFromMap : windowSec) : 0;

      // ✅ Productivity: Only calculate for TRIMMING segment; others show 0 (or blank)
// CAP per-hour percent at 100
let pct = null;     // use null for non-trimming so we can render as — later
if (isTrimming) {
  const rawPct = targetSec > 0 ? (reported / targetSec) * 100 : 0;
  pct = Math.max(0, Math.min(100, Math.round(rawPct)));
}


      const created  = tsToLocal(x.createdAt);

      // store startMs to sort chronologically
      rows.push({
        uid, name, startMs: startMs || 0, windowStr, reported,
        percent: pct, created, targetSec, segment, isTrimming, windowSec
      });
    });

    // Sort rows by user then by startMs so we can compute cumulative correctly per user
    rows.sort((a,b)=>{
      const n = a.name.localeCompare(b.name);
      if(n !== 0) return n;
      return (a.startMs - b.startMs);
    });

    
    // Compute cumulative productivity per user (for the selected date)
    // cumulativeRaw: keeps the true running total (can exceed 100)
    // _cumulativePct: capped display value (max 100)
    // _overflowPct: extra above 100 (shown as +N%)
    const cumulativePctMap = new Map();

    // Build per-user arrays and process sequentially
    const rowsByUser = {};
    rows.forEach(r=>{
      rowsByUser[r.uid] = rowsByUser[r.uid] || [];
      rowsByUser[r.uid].push(r);
    });

    // Now render per-user in chronological order and compute cumulative
    const fmtTargetOrEmpty = (sec) => sec ? fmt(sec) : '';
    const showRows = []; // flattened in the order to render

    Object.keys(rowsByUser).forEach(uid=>{
      const userRows = rowsByUser[uid];
      // ensure userRows already sorted by startMs (rows were sorted globally earlier)
      let cumulativeRaw = 0; // true running total (may exceed 100)
      userRows.forEach(r=>{
        // Determine incremental percent for this row:
        const incrementalPct = r.isTrimming ? (r.percent !== null && r.percent !== undefined ? Number(r.percent) : 0) : 0;

        const prevCumulativeRaw = cumulativeRaw;
        cumulativeRaw = cumulativeRaw + incrementalPct; // keep true total (unbounded)

        // Display value capped at 100; overflow is any amount above 100
        const displayCumulative = Math.min(100, Math.round(cumulativeRaw));
        const overflow = cumulativeRaw > 100 ? Math.max(0, Math.round(cumulativeRaw - 100)) : 0;

        // store values for render
        r._incrementalPct = Math.round(incrementalPct);
        r._cumulativeRaw = cumulativeRaw;
        r._cumulativePct = displayCumulative;   // capped (0..100)
        r._overflowPct = overflow;              // 0 if none else positive int
        r._prevCumulative = Math.min(100, Math.round(prevCumulativeRaw));

        showRows.push(r);
      });

      // Keep last cumulative for user if needed elsewhere
      cumulativePctMap.set(uid, { cumulative: Math.min(100, Math.round(cumulativeRaw)) });
    });
showRows.forEach(r=>{
      const targetDisplay = r.isTrimming && r.targetSec ? fmtTargetOrEmpty(r.targetSec) : '';

      // Build productivity display: cumulative% (+incremental%) — only for Trimming rows
const cumulativeDisplay = (r.isTrimming && r._cumulativePct != null)
  ? `${r._cumulativePct}%`
  : '—'; // show em dash for non-trimming

const incrementalDisplay = (r.isTrimming && r._incrementalPct != null && r._incrementalPct > 0)
  ? `${r._incrementalPct}%`
  : '';


      // If this is first report for the user (prevCumulative === 0) we'll simply show "4%" (no "+4%")
      const incrementalHtml = (r.isTrimming && r._prevCumulative && r._prevCumulative > 0 && r._incrementalPct > 0)
  ? `<span style="color:#39b54a;font-size:11px;margin-left:6px">(+${escapeHtml(incrementalDisplay)})</span>`
  : '';


      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.windowStr)}</td>
        <td>${fmt(r.reported)} ${r.segment ? ` <span style="color:#9aa2b1">(${escapeHtml(r.segment)})</span>` : ''}</td>
        <td>${escapeHtml(targetDisplay)}</td>
        <td><b>${escapeHtml(cumulativeDisplay)}</b> ${incrementalHtml}</td>
        <td>${escapeHtml(r.created)}</td>
        <td style="display:none">${escapeHtml(r.segment || '')}</td>
      `;
      hrTblBody.appendChild(tr);

      // hrRowsCache row columns:
      // Name, Hour Window, Reported Focus (HH:MM:SS), Target(HH:MM:SS), Productivity Cumulative (e.g., "8%"), Incremental (e.g., "+4%"), Submitted, Segment
      hrRowsCache.push([
  r.name,
  r.windowStr,
  fmt(r.reported),
  targetDisplay,
  (r.isTrimming && r._cumulativePct != null) ? `${r._cumulativePct}%` : '—',
  (r.isTrimming && r._incrementalPct != null && r._incrementalPct > 0) ? `+${r._incrementalPct}%` : '',
  r.created,
  r.segment || ''
]);
});

    if(showRows.length === 0){
      hrTblBody.innerHTML = `<tr><td colspan="9" class="muted">No hourly reports (after filter).</td></tr>`;
    }
  }, (err)=>{
    console.error('hourlyReports snapshot error', err);
  });
}


btnExportHR?.addEventListener('click', ()=>{
  const headers = ['Name','Hour Window','Reported Focus (HH:MM:SS)','Target (HH:MM:SS)','Productivity','Submitted','Segment'];
  const rows = [headers];
  hrRowsCache.forEach(r=> rows.push(r.map(csvEscape)));
  const csv = rows.map(r=>r.join(',')).join('\n');
  downloadCsv(csv, `hourly_${hrDateInp?.value || 'date'}.csv`);
});

/* ---- Active phase highlight for KPI (no UI changes elsewhere) ---- */
function applyActivePhaseHighlightToKPI(){
  if(!kpiTblBody) return;

  // remove previous highlights + hide live badges
  kpiTblBody.querySelectorAll('.kpi-cell').forEach(td=>{
    td.classList.remove('kpi-active');
    td.style.border = '';
    td.style.boxShadow = '';
    td.style.color = '';
    td.style.fontWeight = '';
    td.style.borderRadius = '';
    td.style.padding = '';

    const live = td.querySelector('.kpi-live');
    if(live) live.style.display = 'none';
  });

  // Build set of active UIDs (deduped) from ACTIVE_PHASES
  const activeUids = new Set(Array.from(ACTIVE_PHASES.keys()));

  // stop intervals for UIDs not present in ACTIVE_PHASES
  Array.from(LIVE_INTERVALS.keys()).forEach(uid=>{
    if(!activeUids.has(uid)){
      try{ clearInterval(LIVE_INTERVALS.get(uid)?.iid);}catch(_){}
      LIVE_INTERVALS.delete(uid);
      kpiTblBody.querySelectorAll(`.kpi-live[data-uid="${cssEscape(uid)}"]`).forEach(el=>{ el.style.display = 'none'; });
    }
  });

  // add / update for each active user
  ACTIVE_PHASES.forEach(({type, startMs}, uid)=>{
    if(!type) return;
    const selector = `.kpi-cell[data-uid="${cssEscape(uid)}"][data-phase="${cssEscape(type)}"]`;
    const td = kpiTblBody.querySelector(selector);
    if(!td) return;
    td.classList.add('kpi-active');
    td.style.border = '2px solid #00ff66';
    td.style.borderRadius = '6px';
    td.style.padding = '2px';
    td.style.boxShadow = 'inset 0 0 0 1px #00ff66';
    td.style.color = '#00ff66';
    td.style.fontWeight = '700';

    const live = td.querySelector('.kpi-live');
    if(live){
      live.style.display = 'inline-block';
      const liveTimer = live.querySelector('.live-timer');
      const startMsNum = anyToMs(startMs) || Date.now();
      const updateOnce = ()=>{ const elapsedSec = Math.max(0, Math.round((Date.now() - startMsNum)/1000)); if(liveTimer) liveTimer.textContent = fmt(elapsedSec); };
      updateOnce();

      if(LIVE_INTERVALS.has(uid)){
        try{ clearInterval(LIVE_INTERVALS.get(uid)?.iid); }catch(_){ }
        LIVE_INTERVALS.delete(uid);
      }

      const iid = setInterval(()=>{
        const el = kpiTblBody.querySelector(`.kpi-live[data-uid="${cssEscape(uid)}"][data-phase="${cssEscape(type)}"] .live-timer`);
        if(!el){
          try{ clearInterval(iid);}catch(_){ }
          if(LIVE_INTERVALS.get(uid)?.iid === iid) LIVE_INTERVALS.delete(uid);
          return;
        }
        updateOnce();
      }, 1000);

      LIVE_INTERVALS.set(uid, { iid, phase: type });
    }
  });
}
// CSS.escape polyfill fallback (older Chromium builds)
function cssEscape(s){
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/"/g,'\\"');
}

/* ---- Live active sessions feed (uid -> current phase) ---- */
function liveActiveSessionsForKPI(){
  try{
    onSnapshot(collection(db,'activeSessions'), (snap)=>{
      // Build a deduped map by uid keeping the most-recent startMs per uid
      const tmp = new Map();
      snap.forEach(d=>{
        const x = d.data() || {};
        const uid = x.userId || d.id;
        const type = String(x.type||'').toLowerCase();
        const startMs = anyToMs(x.startMs) || 0;
        if(!uid || !type) return;
        const existing = tmp.get(uid);
        if(!existing || (startMs > (anyToMs(existing.startMs)||0))){
          tmp.set(uid, { type, startMs });
        }
      });

      ACTIVE_PHASES.clear();
      tmp.forEach((v,k)=> ACTIVE_PHASES.set(k, v));

      // re-apply highlight whenever sessions change
      applyActivePhaseHighlightToKPI();
    });
  }catch(e){
    console.warn('activeSessions snapshot failed (KPI highlight will be disabled):', e);
  }
}

/* --------------- Leaderboard (weekly, work only) --------------- */
function renderLeaderboard(){
  // Show Top 10 Trimming Editors (sum from timeLogsSnap trimming entries + hourlyReports trimming)
  // Build 7-day window inclusive
  if(!db) return;
  const end = new Date(); end.setHours(23,59,59,999);
  const start = new Date(end.getTime()); start.setDate(end.getDate()-6); start.setHours(0,0,0,0);
  const startMs = start.getTime(), endMs = end.getTime();

  const map = new Map();

  // 1) Aggregate from local snapshot timeLogsSnap if available
  try{
    if(timeLogsSnap){
      timeLogsSnap.forEach(d=>{
        const x = d.data();
        if(!x) return;
        const t = String(x.type||'').toLowerCase();
        if(t !== 'trimming') return;
        const started = anyToMs(x.startedAtMs ?? x.startedAt ?? x.createdAt);
        if(!started) return;
        if(started < startMs || started > endMs) return;
        const sec = Number(x.duration ?? x.durationSec ?? x.seconds ?? x.dur) || 0;
        const uid = x.userId || x.uid || x.user || 'unknown';
        map.set(uid, (map.get(uid)||0) + sec);
      });
    }
  }catch(e){ console.warn('renderLeaderboard: timeLogsSnap aggregation failed', e); }

  // 2) Also aggregate from hourlyReports (reported trimming seconds)
  try{
    const hrQ = query(collection(db,'hourlyReports'), where('blockStartMs','>=', startMs), where('blockStartMs','<=', endMs));
    getDocs(hrQ).then(snaps=>{
      snaps.forEach(d=>{
        const x = d.data()||{};
        const seg = String(x.segment || x.category || x.type || '').toLowerCase();
        if(seg !== 'trimming') return;
        const uid = x.userId || x.user || 'unknown';
        const sec = Number(x.reportedSec || x.reported || x.reportedSeconds || 0) || 0;
        map.set(uid, (map.get(uid)||0) + sec);
      });

      // after both sources aggregated, render top 10
      const arr = [...map.entries()].map(([uid,sec])=>[uid, sec]).sort((a,b)=>b[1]-a[1]).slice(0,10);
      leaderboardCache = arr; // for Slack export

      leaderDiv.innerHTML = '';
      if(arr.length === 0){ leaderDiv.innerHTML += '<p>No trimming data yet.</p>'; return; }
      arr.forEach((it,i)=>{
        const uid = it[0], sec = it[1] || 0;
        const name = usersMap[uid]?.displayName || uid;
        const row = document.createElement('div');
        row.innerHTML = `<strong>${String(i+1).padStart(2,'0')}. ${escapeHtml(name)}</strong> — <span style=\"color:#9aa2b1\">${fmt(sec)}</span>`;
        leaderDiv.appendChild(row);
      });
    });
  }catch(e){
    console.error('renderLeaderboard (trim) failed', e);
  }
}

/* --------------- Slack (proxy) --------------- */
function initProxyField(){
  const saved = localStorage.getItem('SLACK_PROXY_URL') || DEFAULT_PROXY;
  if(proxyUrlInp) proxyUrlInp.value = saved;
}
btnSaveProxy?.addEventListener('click', ()=>{
  const url = proxyUrlInp.value.trim();
  if(!url) return alert('Enter a proxy URL first.');
  localStorage.setItem('SLACK_PROXY_URL', url);
  alert('Saved.');
});
btnSlack?.addEventListener('click', async ()=>{
  try{
    const text = buildWeeklyLeaderboardTextFromCache();
    const payload = { text };
    const proxy = (localStorage.getItem('SLACK_PROXY_URL') || DEFAULT_PROXY).trim();

    await fetch(proxy, {
      method:'POST',
      mode:'no-cors',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    try{
      await fetch(`${proxy}&text=${encodeURIComponent(text)}`, { mode:'no-cors' });
    }catch(_){ }

    alert('Sent to Slack (via proxy). If you still don’t see it, ensure your Apps Script is deployed as Web App: Anyone.');
  }catch(e){
    console.error(e);
    alert('Slack send failed. Check Apps Script Web App URL or CORS settings.');
  }
});
function buildWeeklyLeaderboardTextFromCache(){
  const end=new Date(); const start=new Date(); start.setDate(end.getDate()-6);
  const lines = [
    `*Weekly Leaderboard — Work Time (Top 10)*`,
    `_Range: ${start.toDateString()} → ${end.toDateString()}_`
  ];
  if(leaderboardCache.length===0){
    lines.push('_No data for this week._');
  }else{
    leaderboardCache.forEach((it,i)=>{
      const name = usersMap[it[0]]?.displayName || it[0];
      lines.push(`${String(i+1).padStart(2,'0')}. ${name} — ${fmt(it[1])}`);
    });
  }
  return lines.join('\n');
}

/* --------------- Attendance (Login/Logout + user-based history) --------------- */

// helper to turn arbitrary event object into a comparable row
function _attRowFromEvent(e){
  const lRaw = e.loginAt ?? e.login ?? e.loginTime ?? e.startAt ?? e.start ?? e.inAt ?? e.login_ms ?? e.loginMs ?? e.loginAtMs;
  const oRaw = e.logoutAt ?? e.logout ?? e.logoutTime ?? e.endAt   ?? e.end   ?? e.outAt ?? e.logout_ms ?? e.logoutMs ?? e.logoutAtMs;

  const loginMs  = anyToMs(lRaw);
  const logoutMs = anyToMs(oRaw);

  const login  = loginMs  ? new Date(loginMs).toLocaleString()  : '';
  const logout = logoutMs ? new Date(logoutMs).toLocaleString() : '';

  return { login, logout, loginMs, logoutMs };
}

// render using current combined state slices
function _renderAttHistoryCombined(key, containerId){
  const div = document.getElementById(containerId);
  if(!div) return;
  const slices = attHistState.get(key) || {};
  const all = [
    ...(slices.docArray||[]),
    ...(slices.subEvents||[]),
    ...(slices.subSessions||[]),
    ...(slices.subHistory||[]),
    ...(slices.topLogs||[]),
    ...(slices.topEvents||[]),
    ...(slices.topHistory||[])
  ];
  if(!all.length){
    div.innerHTML = '<i>No events.</i>';
    if(attRecentBox) attRecentBox.style.display = 'none';
    return;
  }
  const seen = new Set();
  const uniq = [];
  all.forEach(r=>{
    const sig = `${r.loginMs||0}-${r.logoutMs||0}`;
    if(seen.has(sig)) return;
    seen.add(sig);
    uniq.push(r);
  });
  uniq.sort((a,b)=> (a.loginMs||0) - (b.loginMs||0));

  div.innerHTML = uniq.map(ev => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border)">
      Login: ${escapeHtml(ev.login || '—')} &nbsp;|&nbsp; Logout: ${escapeHtml(ev.logout || '—')}
    </div>
  `).join('') + `<div style="height:1px"></div>`;

  const last = uniq[uniq.length-1] || null;
  if(last && attRecentTime){
    if(last.loginMs){
      attRecentTime.textContent = new Date(last.loginMs).toLocaleString();
      if(attRecentBox) attRecentBox.style.display = '';
    }
  }
}

function updateMainRowFromHistory(key, lastEvent){
  // kept for compatibility — intentionally no per-row DOM updates here
}

/**
 * Attach REAL-TIME listeners for all known storage patterns of a user's daily attendance history.
 * We keep listeners per key and merge data sources seamlessly.
 *
 * Looks in:
 *  A) Array fields on the daily attendance doc: sessions | events | history
 *  B) Subcollections under that doc: /events, /sessions, /history
 *  C) Top-level collections: attendanceLogs, attendanceEvents, attendanceHistory (filtered by userId+ymd)
 */
function loadUserAttendanceHistory({ uid, ymd, attendanceDocId, containerId }){
  const key = `${uid}:${ymd}`;
  // If already wired, keep it (we want live updates). Re-render will happen via snapshots.
  if(attHistUnsubs.has(key)) return;

  attHistState.set(key, {});

  const setSlice = (sliceKey, rows)=>{
    const cur = attHistState.get(key) || {};
    cur[sliceKey] = rows;
    attHistState.set(key, cur);
    _renderAttHistoryCombined(key, containerId);
  };
  const toRowsFromSnap = (snap)=>{ const out = []; snap.forEach(d=> out.push(_attRowFromEvent(d.data()||{}))); return out; };

  const unsubs = [];

  // A) Arrays on attendance doc (live)
  if (attendanceDocId){
    try{
      const ref = doc(db,'attendance', attendanceDocId);
      const u = onSnapshot(ref, (ds)=>{
        const data = ds.data() || {};
        let arr = [];
        const arrayField = Array.isArray(data.sessions) ? data.sessions
                         : Array.isArray(data.events)   ? data.events
                         : Array.isArray(data.history)  ? data.history
                         : null;
        if(arrayField){
          arr = arrayField.map(_attRowFromEvent);
        }
        setSlice('docArray', arr);
      });
      unsubs.push(u);
    }catch(_){ }
  }

  // B) Subcollections under the doc: events, sessions, history (live)
  if (attendanceDocId){
    ['events','sessions','history'].forEach(sub=>{
      try{
        const subRef = collection(db,'attendance',attendanceDocId,sub);
        const u = onSnapshot(subRef, (s)=>{
          const rows = toRowsFromSnap(s);
          const keyName = sub === 'events' ? 'subEvents' : (sub === 'sessions' ? 'subSessions' : 'subHistory');
          setSlice(keyName, rows);
        });
        unsubs.push(u);
      }catch(_){ }
    });
  }

  // C) Top-level collections (live)
  ['attendanceLogs','attendanceEvents','attendanceHistory'].forEach(colName=>{
    try{
      const qTop = query(collection(db,colName),
        where('userId','==', uid),
        where('ymd','==', ymd)
      );
      const u = onSnapshot(qTop, (s)=>{
        const rows = toRowsFromSnap(s);
        const keyName = colName === 'attendanceLogs' ? 'topLogs' : (colName === 'attendanceEvents' ? 'topEvents' : 'topHistory');
        setSlice(keyName, rows);
      });
      unsubs.push(u);
    }catch(_){ }
  });

  // Store composite unsubscribe
  attHistUnsubs.set(key, ()=> unsubs.forEach(u=>{ try{u&&u();}catch{} } ));
}

/* ========== NEW HELPER: one-time fetch & render for History (fallback) ========== */
async function fetchAndRenderHistoryOnce({ uid, ymd, attendanceDocId, containerId }) {
  const div = document.getElementById(containerId);
  if(!div) return;
  div.innerHTML = 'Loading…';

  try {
    const results = [];

    // 1) try attendance/{attendanceDocId} doc (array or object-map)
    if(attendanceDocId){
      try{
        const ref = doc(db, 'attendance', attendanceDocId);
        const snap = await getDoc(ref);
        if(snap.exists()){
          const data = snap.data() || {};
          const rawField = data.sessions ?? data.events ?? data.history ?? null;
          if(Array.isArray(rawField)){
            rawField.forEach(r => results.push(_attRowFromEvent(r)));
          } else if(rawField && typeof rawField === 'object'){
            Object.values(rawField).forEach(r => results.push(_attRowFromEvent(r)));
          }
        }
      }catch(e){
        console.warn('fetch attendance doc failed', attendanceDocId, e);
      }
    }

    // 2) try attendance/{docId}/{subcollections}
    if(attendanceDocId){
      for(const sub of ['events','sessions','history']){
        try{
          const q = query(collection(db,'attendance', attendanceDocId, sub));
          const snap = await getDocs(q);
          snap.forEach(d => results.push(_attRowFromEvent(d.data()||{})));
        }catch(e){ /* ignore per-sub fail */ }
      }
    }

    // 3) try top-level collections
    for(const col of ['attendanceLogs','attendanceEvents','attendanceHistory']){
      try{
        const q = query(collection(db,col), where('userId','==', uid), where('ymd','==', ymd));
        const snap = await getDocs(q);
        snap.forEach(d => results.push(_attRowFromEvent(d.data()||{})));
      }catch(e){ /* ignore */ }
    }

    // Dedup + sort
    const seen = new Set();
    const uniq = [];
    results.forEach(r=>{
      const sig = `${r.loginMs||0}-${r.logoutMs||0}`;
      if(seen.has(sig)) return;
      seen.add(sig);
      uniq.push(r);
    });
    uniq.sort((a,b)=> (a.loginMs||0) - (b.loginMs||0));

    if(uniq.length === 0){
      div.innerHTML = '<i>No events found (one-time fetch).</i>';
      if(attRecentBox) attRecentBox.style.display = 'none';
      return;
    }

    div.innerHTML = uniq.map(ev => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border)">
        Login: ${escapeHtml(ev.login || '—')} &nbsp;|&nbsp; Logout: ${escapeHtml(ev.logout || '—')}
      </div>
    `).join('') + `<div style="height:1px"></div>`;

    const last = uniq[uniq.length-1] || null;
    if(last && attRecentTime){
      if(last.loginMs){
        attRecentTime.textContent = new Date(last.loginMs).toLocaleString();
        if(attRecentBox) attRecentBox.style.display = '';
      }
    }
  } catch (e) {
    console.error('fetchAndRenderHistoryOnce failed', e);
    div.innerHTML = '<i>Error loading history.</i>';
  }
}
/* ================= END helper ================= */

/* --------------- Attendance (main table rendering) --------------- */
function liveAttendance(dateStr, userId='all'){
  // tear down any previous attendance listeners + history listeners
  if(attUnsub) try{ attUnsub(); }catch{};
  [...attHistUnsubs.values()].forEach(unsub=>{ try{unsub&&unsub();}catch{} });
  attHistUnsubs.clear();
  attHistState.clear();

  // hide history UI initially
  if(attHistoryDiv) { attHistoryDiv.style.display = 'none'; attHistoryDiv.innerHTML = ''; }
  if(attRecentBox) { attRecentBox.style.display = 'none'; attRecentTime && (attRecentTime.textContent = '—'); }

  const qAtt = query(collection(db,'attendance'), where('ymd','==', dateStr));
  attUnsub = onSnapshot(qAtt, async (snap)=>{
    // We'll aggregate per-user first login (earliest) and last logout (latest)
    attTblBody.innerHTML = '';

    if(snap.empty){
      attTblBody.innerHTML = `<tr><td colspan="5" class="muted">No records for ${escapeHtml(dateStr)}.</td></tr>`;
      attTblBody._rows = [];
      return;
    }

    // Map uid -> aggregated info
    const perUser = new Map();

    const ensureUser = (uid)=>{
      if(!perUser.has(uid)){
        perUser.set(uid, {
          uid,
          name: usersMap[uid]?.displayName || uid,
          firstLoginMs: null,
          lastLogoutMs: null,
          totalMsCandidates: [], // collect totalMs found on attendance docs
          lastSeenMs: null
        });
      }
      return perUser.get(uid);
    };

    // First pass: process attendance collection docs (live snapshot)
    snap.forEach(d=>{
      const x = d.data() || {};
      const uid = x.userId || x.uid || d.id;
      if(!uid) return;

      // If a specific user filter is applied, skip others
      if(userId && userId !== 'all' && uid !== userId) return;

      const u = ensureUser(uid);

      // canonical login/logout fields on attendance docs
      const lMs = anyToMs(x.loginAt ?? x.login ?? x.loginMs ?? x.loginAtMs ?? x.login_time);
      const oMs = anyToMs(x.logoutAt ?? x.logout ?? x.logoutMs ?? x.logoutAtMs ?? x.logout_time);

      // update earliest login
      if(lMs && (!u.firstLoginMs || lMs < u.firstLoginMs)) u.firstLoginMs = lMs;
      // update latest logout
      if(oMs && (!u.lastLogoutMs || oMs > u.lastLogoutMs)) u.lastLogoutMs = oMs;

      // if attendance doc exposes totalMs, gather it
      if(typeof x.totalMs === 'number' && x.totalMs >= 0) u.totalMsCandidates.push(Number(x.totalMs));

      // lastSeen - keep latest
      const lsMs = anyToMs(x.lastSeen);
      if(lsMs && (!u.lastSeenMs || lsMs > u.lastSeenMs)) u.lastSeenMs = lsMs;
    });

    // Next: one-time fetch of top-level attendance collections for the same ymd to capture any missing events
    try{
      const topCols = ['attendanceLogs','attendanceEvents','attendanceHistory'];
      const fetches = topCols.map(col => getDocs(query(collection(db,col), where('ymd','==', dateStr))));
      const snaps = await Promise.all(fetches);
      snaps.forEach(snapTop=>{
        snapTop.forEach(d=>{
          const data = d.data() || {};
          // prefer structured fields if present
          const loginMs = anyToMs(data.loginAt ?? data.login ?? data.loginMs ?? data.loginAtMs ?? data.startAt ?? data.start);
          const logoutMs = anyToMs(data.logoutAt ?? data.logout ?? data.logoutMs ?? data.logoutAtMs ?? data.endAt ?? data.end);
          const uid = data.userId || data.uid || data.user || d.id;
          if(!uid) return;
          if(userId && userId !== 'all' && uid !== userId) return;
          const u = ensureUser(uid);
          if(loginMs && (!u.firstLoginMs || loginMs < u.firstLoginMs)) u.firstLoginMs = loginMs;
          if(logoutMs && (!u.lastLogoutMs || logoutMs > u.lastLogoutMs)) u.lastLogoutMs = logoutMs;
        });
      });
    }catch(e){
      console.warn('one-time fetch of top-level attendance collections failed', e);
    }

    // Build rows array (sorted by name)
    const outRows = [];
    perUser.forEach(u=>{
      // compute office hours: prefer any totalMs, else compute from first/last
      let officeMs = null;
      if(u.totalMsCandidates.length){
        // choose max candidate (best-effort)
        officeMs = Math.max(...u.totalMsCandidates);
      } else if(u.firstLoginMs && u.lastLogoutMs && u.lastLogoutMs >= u.firstLoginMs){
        officeMs = u.lastLogoutMs - u.firstLoginMs;
      }

      outRows.push({
        uid: u.uid,
        name: u.name,
        firstLoginMs: u.firstLoginMs || null,
        lastLogoutMs: u.lastLogoutMs || null,
        officeMs,
        lastSeenMs: u.lastSeenMs || null
      });
    });

    outRows.sort((a,b)=> a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    // Render table rows (one-per-user)
    attTblBody.innerHTML = '';
    const csvRows = [];
    outRows.forEach(r=>{
      const firstLogin = r.firstLoginMs ? new Date(r.firstLoginMs).toLocaleString() : '';
      const lastLogout = r.lastLogoutMs ? new Date(r.lastLogoutMs).toLocaleString() : '';
      let officeDisplay = '';
      if(r.officeMs != null){
        officeDisplay = msToHMS(r.officeMs);
      } else if(r.firstLoginMs && !r.lastLogoutMs){
        officeDisplay = `<div class="attn-live" data-login="${r.firstLoginMs}" data-uid="${r.uid}">● <span class="live-timer">00:00:00</span></div>`;
      } else {
        officeDisplay = msToHMS(0);
      }
      const lastSeen = r.lastSeenMs ? new Date(r.lastSeenMs).toLocaleString() : '';

      const tr = document.createElement('tr');
      tr.classList.add('att-row');
      tr.dataset.uid = r.uid;
      tr.dataset.ymd = dateStr;
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(firstLogin)}</td>
        <td>${escapeHtml(lastLogout)}</td>
        <td>${officeDisplay}</td>
        <td>${escapeHtml(lastSeen)}</td>
      `;
      attTblBody.appendChild(tr);

      csvRows.push([r.name, firstLogin, lastLogout, (r.officeMs!=null? msToHMS(r.officeMs):''), lastSeen]);
    });

    // Save rows for CSV export
    attTblBody._rows = csvRows;

    // live updater for users still logged in
    if(!window._attnLiveUpdater){
      window._attnLiveUpdater = setInterval(()=>{
        document.querySelectorAll('.attn-live').forEach(div=>{
          const loginMs = Number(div.dataset.login);
          if(!loginMs) return;
          const sec = Math.floor((Date.now() - loginMs)/1000);
          const timerEl = div.querySelector('.live-timer');
          if(timerEl) timerEl.textContent = msToHMS(sec*1000);
        });
      },1000);
    }

    if(userId && userId !== 'all'){
      if(attHistoryDiv) attHistoryDiv.style.display = '';

      // Attach per-doc history listeners for attendance collection docs for that user and date
      const docIds = [];
      snap.forEach(d=>{
        const x = d.data();
        const uid = x.userId || x.uid || d.id;
        if(uid === userId) docIds.push({ id: d.id, data:x });
      });

      if(docIds.length === 0){
        (async ()=>{
          await fetchAndRenderHistoryOnce({ uid: userId, ymd: dateStr, attendanceDocId: null, containerId: 'attHistoryContainer' });
        })().catch(e=>console.error('fallback fetch history failed', e));
      } else {
        docIds.forEach(info=>{
          loadUserAttendanceHistory({ uid: userId, ymd: dateStr, attendanceDocId: info.id, containerId: 'attHistoryContainer' });
          fetchAndRenderHistoryOnce({ uid: userId, ymd: dateStr, attendanceDocId: info.id, containerId: 'attHistoryContainer' })
            .catch(e=>console.warn('one-time history fetch failed for doc', info.id, e));
        });
      }

      try{
        const qTop = query(collection(db,'attendanceLogs'), where('userId','==', userId), where('ymd','==', dateStr));
        const uTop = onSnapshot(qTop, (s)=>{
          const rows = [];
          s.forEach(d => rows.push(_attRowFromEvent(d.data()||{})));
          if(rows.length) {
            const cur = attHistState.get(`${userId}:${dateStr}`) || {};
            cur.topLogs = rows;
            attHistState.set(`${userId}:${dateStr}`, cur);
            _renderAttHistoryCombined(`${userId}:${dateStr}`, 'attHistoryContainer');
          }
        });
        attHistUnsubs.set(`${userId}:${dateStr}:topLogs`, ()=>{ try{ uTop(); }catch{} });
      }catch(e){ /* ignore */ }
    } else {
      if(attHistoryDiv) { attHistoryDiv.style.display = 'none'; attHistoryDiv.innerHTML = ''; }
      if(attRecentBox) { attRecentBox.style.display = 'none'; attRecentTime && (attRecentTime.textContent = '—'); }
    }
  }, (err)=>{
    console.error('attendance snapshot failed', err);
    attTblBody.innerHTML = `<tr><td colspan="5" class="muted">Error loading attendance.</td></tr>`;
  });
}

btnExportAtt?.addEventListener('click', ()=>{
  const rows = [['Name','First Login','Last Logout','Office Hours','Last Seen']];
  (attTblBody._rows||[]).forEach(r=> rows.push(r));
  const csv  = rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  downloadCsv(csv, `attendance_${attDateInp.value||'date'}.csv`);
});

/* ----------------- End of file (no other changes) ----------------- */

/* ===== Limits: Pagination + Search + Pin management ===== */

/* ===== Limits: Pagination + Search + Pin management ===== */
(function(){
  const STORAGE_KEY = 'ADMIN_PINNED_EDITORS';
  let pinned = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

  const SAVE_PINS_TO_FIRESTORE = false;

  const searchInp = document.getElementById('limitsSearch');
  const pagerDiv  = document.getElementById('limitsPager');
  const pageSizeSel = document.getElementById('limitsPageSize');
  const tbody = document.querySelector('#limitsTbl tbody');
  const btnSavePinned = document.getElementById('btnSavePinned');

  function getRows(){ return Array.from(tbody.querySelectorAll('tr')); }

  function applyPinStyles(){
    getRows().forEach(tr=>{
      const uid = tr.dataset.uid;
      const btn = tr.querySelector('.pin-btn');
      if(!btn) return;
      if(pinned.has(uid)) {
        btn.classList.add('pinned');
        btn.innerHTML = '&#9733;'; // filled star
      } else {
        btn.classList.remove('pinned');
        btn.innerHTML = '&#9734;'; // outline star
      }
    });
  }

  function reorderPinnedRows(){
    const rows = getRows();
    const pinnedRows = rows.filter(r=> pinned.has(r.dataset.uid));
    const otherRows  = rows.filter(r=> !pinned.has(r.dataset.uid));
    pinnedRows.concat(otherRows).forEach(r => tbody.appendChild(r));
  }

  function togglePin(uid){
    if(pinned.has(uid)) pinned.delete(uid);
    else pinned.add(uid);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(pinned)));
    applyPinStyles();
    reorderPinnedRows();
    if(window._limits_filter_state) window._limits_filter_state();
  }

  async function savePinsToFirestore(){
    try{
      await setDoc(doc(db,'adminPrefs','pinnedEditors'), { uids: Array.from(pinned), updatedAt: serverTimestamp() }, { merge:true });
      alert('Pinned list saved to Firestore.');
    }catch(e){
      console.warn('savePinsToFirestore failed', e);
      alert('Save failed — check console.');
    }
  }

  function buildPager(visibleRows){
    pagerDiv.innerHTML = '';
    const size = Number(pageSizeSel.value)||10;
    const pages = Math.max(1, Math.ceil(visibleRows.length / size));
    for(let p=1;p<=pages;p++){
      const btn = document.createElement('button');
      btn.textContent = p;
      btn.addEventListener('click', ()=> showPage(p, visibleRows));
      pagerDiv.appendChild(btn);
    }
  }

  function showPage(page, visibleRows){
    const all = getRows();
    all.forEach(r=> r.classList.add('row-hidden'));
    const size = Number(pageSizeSel.value)||10;
    const start = (page-1)*size;
    visibleRows.slice(start, start+size).forEach(r=> r.classList.remove('row-hidden'));
    Array.from(pagerDiv.children).forEach((b, idx)=> { b.classList.toggle('active', idx === page-1); });
  }

  function applyFilterAndPage(){
    const q = (searchInp.value||'').toLowerCase().trim();
    const rows = getRows();
    let visible = rows.filter(r=>{
      const name = (r.cells[0]?.textContent || '').toLowerCase();
      return name.includes(q);
    });

    visible.sort((a,b)=>{
      const aPinned = pinned.has(a.dataset.uid) ? 0 : 1;
      const bPinned = pinned.has(b.dataset.uid) ? 0 : 1;
      if(aPinned !== bPinned) return aPinned - bPinned;
      return (a.textContent||'').localeCompare(b.textContent||'');
    });

    buildPager(visible);
    showPage(1, visible);
  }

  window.renderLimitsFinished = ()=> {
    setTimeout(()=>{
      getRows().forEach(tr=>{
        const uid = tr.dataset.uid;
        const btn = tr.querySelector('.pin-btn');
        if(!btn) return;
        if(!btn._pinned_init){
          btn.addEventListener('click', ()=> togglePin(uid));
          btn._pinned_init = true;
        }
      });
      try{ pinned = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }catch(e){ pinned = new Set(); }
      applyPinStyles();
      reorderPinnedRows();
      applyFilterAndPage();
    }, 20);
  };

  window._limits_filter_state = applyFilterAndPage;

  pageSizeSel?.addEventListener('change', applyFilterAndPage);
  searchInp?.addEventListener('input', applyFilterAndPage);
  btnSavePinned?.addEventListener('click', ()=> {
    if(SAVE_PINS_TO_FIRESTORE){
      savePinsToFirestore();
    } else {
      alert('Pinned list saved in your browser.');
    }
  });
})();
