// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// small helper for safe subscriptions
function subscribe(channel, fn) {
  if (typeof fn !== 'function') return () => {};
  const handler = (_e, data) => fn(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('eTimer', {
  // Overlay controls used by renderer/app.js
  show:   (payload = { type: '—', seconds: 0 }) => ipcRenderer.invoke('etimer:show', payload),
  update: (payload = {})                        => ipcRenderer.invoke('etimer:update', payload),
  hide:   ()                                    => ipcRenderer.invoke('etimer:hide'),
  openApp:()                                    => ipcRenderer.invoke('etimer:open-app'),

  // Overlay quick-action buttons (overlay -> main)
  sendCmd: (type) => { try { ipcRenderer.send('overlay:cmd', String(type)); } catch {} },

  // App renderer can subscribe to commands (main -> app)
  receiveCmd: (fn) => subscribe('timer:cmd', fn),

  // Generic event subscriptions
  on: (channel, fn) => {
    if (channel === 'overlay:update') return subscribe('overlay:update', fn);
    if (channel === 'overlay:bounce') return subscribe('overlay:bounce', fn);
    if (channel === 'timer:cmd')      return subscribe('timer:cmd', fn);
    if (channel === 'lunch:popup')    return subscribe('lunch:popup', fn);
    return () => {};
  },

  // Position helpers
  requestPosition: () => ipcRenderer.invoke('overlay:get-position'),
  setPosition: (x, y) => ipcRenderer.invoke('overlay:set-position', { x, y }),

  // System idle seconds (for auto break/resume)
  systemIdleSeconds: () => ipcRenderer.invoke('system:get-idle-seconds'),

  // ✅ NEW: Day Logout Handler
  dayLogout: (grandTotalSeconds) => ipcRenderer.invoke('day:logout', grandTotalSeconds),

  // Environment flags
  platform: process.platform,
  isMac: process.platform === 'darwin',
  versions: process.versions
});
// Allow renderer to ask main process to post to Slack (main will use env vars)
contextBridge.exposeInMainWorld('postSlack', async (payload) => {
  try {
    return await ipcRenderer.invoke('app:post-slack', payload);
  } catch (e) {
    console.warn('postSlack IPC failed', e);
    return { status: 'error', error: e?.message };
  }
});
