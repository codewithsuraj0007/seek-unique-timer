 // lunch-ipc-bridge.js
// Listens for main-process 'lunch:popup' events and triggers the in-page lunch popup logic.

// If running in Electron, the preload exposes eTimer.on('lunch:popup', fn)
// For non-Electron browsers this file is harmless.

(function(){
  function triggerLocalPopup(data){
    try{
      // If the page exposes a test trigger or the lunch scheduler's manual function
      if (typeof window.__triggerLunchPopupNow === 'function') {
        window.__triggerLunchPopupNow();
        return;
      }
      // Fallback: dispatch a custom event to let lunch-scheduler.js know
      const ev = new CustomEvent('lunch:popup', { detail: data || {} });
      window.dispatchEvent(ev);
    }catch(e){ console.warn('triggerLocalPopup failed', e); }
  }

  try{
    if (window.eTimer && typeof window.eTimer.on === 'function') {
      window.eTimer.on('lunch:popup', (data)=>{ triggerLocalPopup(data); });
    }
    // Also listen to direct DOM event if main used document event
    window.addEventListener('lunch:popup', (e)=>{ triggerLocalPopup(e.detail); });
  }catch(e){ console.warn('lunch-ipc-bridge init failed', e); }
})();
