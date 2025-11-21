#!/usr/bin/env node
/*
  tools/syncKPI.js
  Sync Admin Panel KPI -> App Productivity field
  Usage (examples):
    node tools/syncKPI.js --adminApi "https://example.com/api/admin/kpi" --appApi "http://localhost:3000/api/app" --date 2025-10-04 --dryRun
    node tools/syncKPI.js --adminTableUrl "https://admin.example.com/kpi" --appApi "http://localhost:3000/api/app" --date 2025-10-04

  Options:
    --adminApi       Admin KPI API (preferred). Example: /api/admin/kpi?date=YYYY-MM-DD or accepts start/end params
    --adminTableUrl  Admin KPI page URL (HTML table fallback)
    --appApi         Base URL for the app API (e.g. http://localhost:3000/api/app)
    --date           Date YYYY-MM-DD to query (default today)
    --dryRun         If present, do not write, only preview
    --previewOut     File path to write preview JSON/CSV
    --batchSize      How many updates per batch (default 50)
    --rateLimit      Requests per second for write calls (default 5)
    --writeMissingAsDash  true|false (default true) write "—" for missing KPI; if false, leaves unchanged

*/

const axios = require('axios');
const fs = require('fs');
const path = require('path');

function parseArgs(){
  const argv = require('minimist')(process.argv.slice(2));
  return argv;
}

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

async function fetchAdminApi(adminApi, params){
  const url = new URL(adminApi);
  Object.keys(params||{}).forEach(k=>{ if(params[k] !== undefined) url.searchParams.set(k, params[k]); });
  const res = await axios.get(url.toString(), { timeout: 10000 });
  return res.data;
}

async function fetchAdminTable(url){
  // optional dependency on jsdom
  let JSDOM;
  try{ JSDOM = require('jsdom').JSDOM; }catch(e){ throw new Error('jsdom is required for HTML table parsing. Install with: npm install jsdom'); }
  const res = await axios.get(url, { timeout: 10000 });
  const dom = new JSDOM(res.data);
  const doc = dom.window.document;

  // Find table with a header containing 'Productivity' (case-insensitive)
  const tables = Array.from(doc.querySelectorAll('table'));
  for(const table of tables){
    const ths = Array.from(table.querySelectorAll('th'));
    const headers = ths.map(t=> (t.textContent||'').trim().toLowerCase());
    const prodIdx = headers.findIndex(h => h.includes('productivity'));
    if(prodIdx === -1) continue;

    // Identify possible userId/username column index
    const idIdx = headers.findIndex(h => h.includes('userid') || h.includes('user id') || h.includes('id'));
    const nameIdx = headers.findIndex(h => h.includes('username') || h.includes('user') || h.includes('name'));

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const out = [];
    for(const r of rows){
      const cells = Array.from(r.querySelectorAll('td'));
      const prod = (cells[prodIdx] && (cells[prodIdx].textContent||'').trim()) || '';
      const uid = idIdx >=0 ? (cells[idIdx] && (cells[idIdx].textContent||'').trim()) : null;
      const uname = nameIdx >=0 ? (cells[nameIdx] && (cells[nameIdx].textContent||'').trim()) : null;
      out.push({ userId: uid, username: uname, productivity: prod, rawRowHtml: r.innerHTML });
    }
    return out;
  }
  throw new Error('No table with Productivity column found');
}

function isDashLike(v){ return v === '—' || v === '-' || v === '' || v === null || v === undefined; }

function validateValueFormat(v){
  if(typeof v !== 'string') return false;
  const s = v.trim();
  if(s === '—' || s === '-' || s === '') return true;
  if(/^[0-9]+(\.[0-9]+)?%$/.test(s)) return true;
  if(/^[0-9]+(\.[0-9]+)?$/.test(s)) return true;
  return false;
}

async function patchAppProductivity(appApiBase, userId, value, opts={dryRun:true, rateLimitDelayMs:200}){
  // appApiBase is expected like http://host:port/api/app
  const url = `${appApiBase.replace(/\/$/,'')}/users/${encodeURIComponent(userId)}/kpi`;
  if(opts.dryRun) return { ok: true, url, method: 'PATCH', body: { productivity: value } };
  const res = await axios.patch(url, { productivity: value }, { timeout: 10000 });
  return { ok: true, status: res.status, data: res.data };
}

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function main(){
  const argv = parseArgs();
  const adminApi = argv.adminApi || argv.adminapi || null;
  const adminTableUrl = argv.adminTableUrl || argv.adminTable || null;
  const appApi = argv.appApi || argv.appapi || null;
  if(!appApi) { console.error('Missing --appApi (base URL for app)'); process.exit(1); }

  const date = argv.date || todayISO();
  const dryRun = argv.dryRun || false;
  const previewOut = argv.previewOut || argv.preview || null;
  const batchSize = Number(argv.batchSize || 50);
  const rateLimit = Number(argv.rateLimit || 5);
  const writeMissingAsDash = argv.writeMissingAsDash === 'false' ? false : true;

  console.log('kpiSync: starting', { adminApi, adminTableUrl, appApi, date, dryRun, batchSize, rateLimit });

  let kpiData = [];
  if(adminApi){
    try{
      const data = await fetchAdminApi(adminApi, { date });
      // expect array of { userId, productivity, updatedAt }
      if(Array.isArray(data)) kpiData = data.map(d=>({ userId: d.userId || d.userid || d.id || null, username: d.username || d.user || null, productivity: (d.productivity===undefined? d.Productivity : d.productivity) }));
      else if(data && data.items) kpiData = data.items;
      else throw new Error('Unexpected adminApi response shape');
    }catch(e){ console.error('Failed to fetch adminApi', e.message); process.exit(1); }
  } else if(adminTableUrl){
    try{ kpiData = await fetchAdminTable(adminTableUrl); }catch(e){ console.error('Failed to fetch adminTableUrl', e.message); process.exit(1); }
  } else {
    console.error('Either --adminApi or --adminTableUrl must be provided'); process.exit(1);
  }

  // Acquire app users mapping
  let appUsers = [];
  try{
    const url = `${appApi.replace(/\/$/,'')}/users`;
    const res = await axios.get(url, { timeout: 10000 });
    if(Array.isArray(res.data)) appUsers = res.data; else if(res.data && res.data.users) appUsers = res.data.users; else throw new Error('Unexpected app /users response');
  }catch(e){ console.error('Failed to fetch app users mapping from', appApi + '/users', e.message); process.exit(1); }

  // Build index of KPI data by userId and by username
  const kpiById = new Map();
  const kpiByName = new Map();
  for(const row of kpiData){
    const uid = row.userId || (row.userid) || null;
    const uname = (row.username||row.user||'')?.trim().toLowerCase() || null;
    if(uid) {
      // If duplicate, prefer most recent updatedAt if available
      if(kpiById.has(uid)){
        const existing = kpiById.get(uid);
        if(row.updatedAt && existing.updatedAt){ if(new Date(row.updatedAt) > new Date(existing.updatedAt)) kpiById.set(uid,row); }
      } else kpiById.set(uid, row);
    }
    if(uname) {
      if(!kpiByName.has(uname)) kpiByName.set(uname, row);
    }
  }

  // Prepare work list
  const operations = [];
  for(const u of appUsers){
    const userId = u.userId || u.id || u.user || u.uid;
    const username = (u.username || u.user || u.name || '')?.trim()?.toLowerCase() || null;
    let source = null;
    if(userId && kpiById.has(userId)) source = kpiById.get(userId);
    else if(username && kpiByName.has(username)) source = kpiByName.get(username);
    // record
    const srcVal = source ? (source.productivity || source.Productivity || '') : null;
    operations.push({ userId, username, srcVal, sourceRow: source || null, appRow: u });
  }

  // Preview list and logs
  const preview = [];
  const logs = [];

  // Rate limiting delay in ms per request
  const delayMs = Math.max(0, Math.round(1000 / Math.max(1, rateLimit)));

  // process in batches
  for(let i=0;i<operations.length;i+=batchSize){
    const batch = operations.slice(i,i+batchSize);
    const promises = batch.map(async (op, idx)=>{
      const beforeVal = (op.appRow && (op.appRow.productivity || op.appRow.productivityValue)) || null;
      let sourceVal = (op.srcVal === undefined || op.srcVal === null) ? null : String(op.srcVal).trim();
      if(sourceVal && !validateValueFormat(sourceVal)){
        logs.push({ userId: op.userId, username: op.username, status: 'skipped', reason: 'invalid_format', sourceValue: sourceVal, timestamp: (new Date()).toISOString() });
        preview.push({ userId: op.userId, username: op.username, before: beforeVal, after: null, action: 'skipped_invalid_format' });
        return;
      }
      if(isDashLike(sourceVal)){
        if(writeMissingAsDash){ sourceVal = '—'; } else { logs.push({ userId: op.userId, username: op.username, status: 'skipped', reason: 'missing_source', timestamp: (new Date()).toISOString() }); preview.push({ userId: op.userId, username: op.username, before: beforeVal, after: null, action: 'skipped_missing' }); return; }
      }

      // if same as before, skip (idempotency)
      if(sourceVal === beforeVal){ preview.push({ userId: op.userId, username: op.username, before: beforeVal, after: sourceVal, action: 'no_change' }); logs.push({ userId: op.userId, status: 'no_change', sourceValue: sourceVal, timestamp: (new Date()).toISOString() }); return; }

      // prepare write
      try{
        // Rate-limited write
        await sleep(delayMs * (idx+1));
        const res = await attemptWithBackoff(()=> patchAppProductivity(appApi, op.userId, sourceVal, { dryRun }), { retries: 4 });
        preview.push({ userId: op.userId, username: op.username, before: beforeVal, after: sourceVal, action: dryRun ? 'preview' : 'updated' });
        logs.push({ userId: op.userId, status: 'ok', sourceValue: sourceVal, timestamp: (new Date()).toISOString(), result: res });
      }catch(e){
        logs.push({ userId: op.userId, status: 'error', reason: e.message, timestamp: (new Date()).toISOString() });
        preview.push({ userId: op.userId, username: op.username, before: beforeVal, after: null, action: 'error' });
      }
    });
    await Promise.all(promises);
  }

  const summary = { total: operations.length, previewCount: preview.length, logsCount: logs.length };
  console.log('kpiSync: done', summary);
  if(previewOut){
    const outPath = path.resolve(previewOut);
    fs.writeFileSync(outPath, JSON.stringify({ preview, logs, summary }, null, 2), 'utf8');
    console.log('Preview written to', outPath);
  } else {
    console.log('Preview sample:', preview.slice(0,10));
  }
}

async function attemptWithBackoff(fn, opts={retries:3, baseMs:500}){
  let attempt = 0;
  let lastErr;
  while(attempt <= opts.retries){
    try{ return await fn(); }catch(e){ lastErr = e; attempt++; const wait = opts.baseMs * Math.pow(2, attempt); await sleep(wait); }
  }
  throw lastErr;
}

main().catch(e=>{ console.error('kpiSync failed', e && e.message); process.exit(1); });
