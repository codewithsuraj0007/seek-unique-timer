// main.js
const { app, BrowserWindow, ipcMain, screen, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStaticServer } = require('./server');
const https = require('https');
const { URL } = require('url');

let mainWindow = null;
let overlayWindow = null;
let staticSrv = null;

// Stable userData dir
app.setPath('userData', path.join(__dirname, 'user_data'));
app.setAppUserModelId('com.seekunique.timer');

/* ---------- Persist overlay position ---------- */
const posFile = path.join(app.getPath('userData'), 'overlay-pos.json');
const readPos = () => { try { return JSON.parse(fs.readFileSync(posFile, 'utf8')); } catch { return null; } };
const writePos = (pos) => { try { fs.writeFileSync(posFile, JSON.stringify(pos)); } catch {} };

/* Clamp a rect to the nearest display */
function clampToScreen(x, y, w, h) {
  const { bounds } = screen.getDisplayNearestPoint({ x: x ?? 0, y: y ?? 0 });
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width  - w;
  const maxY = bounds.y + bounds.height - h;
  return {
    x: Math.min(Math.max(x ?? minX, minX), maxX),
    y: Math.min(Math.max(y ?? minY, minY), maxY),
  };
}

/* ---------- Main window ---------- */
async function createWindows() {
  staticSrv = await createStaticServer(0);
  const startUrl = `${staticSrv.url}/app.html`;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'Seek Unique Timer',
    backgroundColor: '#1e003d',
    icon: path.join(__dirname, '..', 'assets', 'appicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('minimize', () => showOverlayNow());
  mainWindow.on('hide', () => showOverlayNow());
}

/* ---------- Desktop overlay ---------- */
function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const W = 300, H = 90;
  let x, y;
  const saved = readPos();
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const p = clampToScreen(saved.x, saved.y, W, H);
    x = p.x; y = p.y;
  }

  overlayWindow = new BrowserWindow({
    width: W,
    height: H,
    x, y,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    roundedCorners: true,
    alwaysOnTop: true,
    fullscreenable: false,
    icon: path.join(__dirname, '..', 'assets', 'appicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setFullScreenable(false);
  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'floating.html'));

  overlayWindow.on('moved', () => {
    try {
      const [ox, oy] = overlayWindow.getPosition();
      const p = clampToScreen(ox, oy, W, H);
      if (p.x !== ox || p.y !== oy) {
        overlayWindow.setPosition(p.x, p.y);
        overlayWindow.webContents.send('overlay:bounce');
      }
      writePos({ x: p.x, y: p.y });
    } catch {}
  });

  screen.on('display-metrics-changed', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const [ox, oy] = overlayWindow.getPosition();
    const p = clampToScreen(ox, oy, W, H);
    overlayWindow.setPosition(p.x, p.y);
    writePos({ x: p.x, y: p.y });
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
  return overlayWindow;
}

function showOverlayNow(payload = { type: 'WORK', seconds: 0 }) {
  const w = createOverlay();
  if (!w.isVisible()) w.showInactive();
  w.webContents.send('overlay:update', payload);
}

/* ---------- Google Sign-In popup ---------- */
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      parent: mainWindow,
      modal: true,
      width: 500,
      height: 600,
      title: 'Seek Unique Login',
      icon: path.join(__dirname, '..', 'assets', 'appicon.ico'),
      backgroundColor: '#1e003d',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    }
  }));
});

/* ---------- IPC bridge ---------- */
ipcMain.handle('etimer:show', (_evt, payload) => { showOverlayNow(payload || { type: '—', seconds: 0 }); });
ipcMain.handle('etimer:update', (_evt, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:update', payload || {});
  }
});
ipcMain.handle('etimer:hide', () => { overlayWindow?.hide(); });
ipcMain.handle('etimer:open-app', () => { mainWindow?.show(); mainWindow?.focus(); });

ipcMain.handle('overlay:get-position', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null;
  const [x, y] = overlayWindow.getPosition();
  return { x, y };
});
ipcMain.handle('overlay:set-position', (_e, { x, y }) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { width: W, height: H } = overlayWindow.getBounds();
  const p = clampToScreen(x, y, W, H);
  overlayWindow.setPosition(p.x, p.y);
  writePos({ x: p.x, y: p.y });
});

ipcMain.handle('system:get-idle-seconds', () => {
  try { return powerMonitor.getSystemIdleTime(); } catch { return 0; }
});

['suspend','resume','lock-screen','unlock-screen'].forEach(ev=>{
  powerMonitor.on(ev, () => {
    try { mainWindow?.webContents.send('system:pm', ev); } catch {}
  });
});

ipcMain.on('overlay:cmd', (_evt, type) => {
  if (!type) return;
  mainWindow?.webContents.send('timer:cmd', String(type));
  mainWindow?.show();
});

// Allow renderer to ask main to post to Slack. Main process will read environment
// variables (SLACK_WEBHOOK or SLACK_PROXY_URL) so secrets aren't baked into renderer.
ipcMain.handle('app:post-slack', async (_evt, payload) => {
  try {
    const text = (payload && payload.text) ? String(payload.text) : '';
    if (!text) return { status: 'ignored', reason: 'empty_text' };

    // Prefer direct webhook if provided, otherwise fall back to proxy
  const webhook = process.env.SLACK_WEBHOOK || null;
  const proxyEnv = process.env.SLACK_PROXY_URL || null;
  // allow renderer to pass a proxyUrl from localStorage as fallback
  const proxyPayload = (payload && payload.proxyUrl) ? String(payload.proxyUrl) : null;
  const proxy = proxyEnv || proxyPayload;

    const body = webhook ? JSON.stringify({ text }) : JSON.stringify({ text });

    // Small built-in HTTP POST helper that uses node's https module (no external deps)
    const doPost = (targetUrl, bodyStr) => {
      return new Promise((resolve, reject) => {
        try{
          const u = new URL(targetUrl);
          const data = Buffer.from(bodyStr || '');
          const opts = {
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + (u.search || ''),
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
          };
          const req = https.request(opts, (res) => {
            // consume body
            res.on('data', ()=>{});
            res.on('end', ()=> resolve({ statusCode: res.statusCode }));
          });
          req.on('error', (err) => { console.warn('doPost error', err); reject(err); });
          req.write(data);
          req.end();
        }catch(e){ reject(e); }
      });
    };

    const target = webhook || proxy;
    if (!target) {
      console.warn('app:post-slack - no SLACK_WEBHOOK or SLACK_PROXY_URL configured and no proxyUrl provided');
      return { status: 'ignored', reason: 'no_target_configured' };
    }

    console.log('app:post-slack - posting to target:', webhook ? 'SLACK_WEBHOOK' : (proxyEnv ? 'SLACK_PROXY_URL' : 'payload.proxyUrl'));

    // Fire-and-forget: use the native HTTPS helper to avoid fetch/node-fetch issues
    (async () => {
      try {
        await doPost(target, body);
        console.log('app:post-slack - doPost initiated');
      } catch (err) {
        console.warn('Slack post failed in main (doPost)', err);
      }
    })();

    return { status: 'ok', sentTo: webhook ? 'webhook' : 'proxy' };
  } catch (err) {
    console.warn('app:post-slack handler error', err);
    return { status: 'error', error: String(err) };
  }
});

/* ------------------ Daily Lunch Scheduler (main process) ------------------ */
// Sends a one-off IPC per day to renderer(s) to show the lunch popup and also posts a Slack message.
let _lastLunchDay = null; // yyy-mm-dd
function ymdLocal(d){ const dt = d || new Date(); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function scheduleLunchChecker(){
  setInterval(async ()=>{
    try{
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();
      const day = ymdLocal(now);
      if (hh === 14 && mm === 30 && _lastLunchDay !== day) {
        _lastLunchDay = day;
        // Notify renderer(s)
        try{
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lunch:popup', { message: "Hey Bode, lunch is start. Take lunch." });
          // also notify overlay if present
          if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('lunch:popup', { message: "Hey Bode, lunch is start. Take lunch." });
        }catch(e){ console.warn('lunch:popup IPC failed', e); }

        // Send to Slack via proxy (best-effort, non-blocking)
        const slackProxy = process.env.SLACK_PROXY_URL || null;
        const slackText = 'Hey Bode, lunch is start. Take lunch.';
        if (slackProxy) {
          try { fetch(slackProxy, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: slackText }) }).catch(()=>{}); } catch(_){}
        }
      }
    }catch(e){ console.warn('scheduleLunchChecker error', e); }
  }, 60*1000);
}

app.whenReady().then(()=>{
  try{ scheduleLunchChecker(); }catch(e){ console.warn('scheduleLunchChecker init failed', e); }
});

/* ---------- ✅ NEW DAY LOGOUT HANDLER ---------- */
ipcMain.handle('day:logout', async (_evt, grandTotalSeconds) => {
  try {
    const hours = grandTotalSeconds / 3600;
    if (hours < 9) {
      // Case 1: less than 9 hrs → behave like ❌ close button
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
      return { status: 'closed', reason: 'less_than_9_hours' };
    } else {
      // Case 2: 9 hrs or more → save + logout + reset
      mainWindow?.webContents.send('db:save-before-logout');  // let renderer handle DB save
      mainWindow?.webContents.send('user:logout');            // signal logout
      mainWindow?.webContents.send('timer:reset');            // reset time counter
      return { status: 'logout_done', reason: '>=9_hours' };
    }
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

/* ---------- lifecycle ---------- */
app.whenReady().then(createWindows);
app.on('activate', () => { if (mainWindow === null) createWindows(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { staticSrv?.server?.close?.(); });
