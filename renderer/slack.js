// renderer/slack.js
// Small, focused Slack send helper used by renderer code.
// - Primary path: call the main process via window.eTimer.postSlack (preload -> ipcMain)
// - Fallback: try local proxy URL stored in localStorage (keeps backward compatibility)

export async function sendSlackMessage(text){
  if (!text) return;
  // Prefer main-process-backed sender which reads environment variables securely
  try{
    if (window?.postSlack) {
      // ask main to post; include any locally-configured proxy so main can use it
      try{
        console.debug('sendSlackMessage: invoking main postSlack IPC');
        const saved = localStorage.getItem('SLACK_PROXY_URL');
        const proxyUrl = (saved && saved.trim()) ? saved.trim() : null;
        const res = await window.postSlack({ text, proxyUrl });
        console.debug('sendSlackMessage: postSlack IPC response', res);
          // If main says no target configured, prompt user once to set one (helps users who didn't set env vars)
          if (res && res.status === 'ignored' && res.reason === 'no_target_configured') {
          try{
            const input = prompt('No Slack webhook/proxy configured. Paste Slack webhook or proxy URL to enable sends (leave blank to cancel):','');
            if (input && input.trim()){
              const trimmed = input.trim();
              localStorage.setItem('SLACK_PROXY_URL', trimmed);
              // retry with the provided proxy
              try{ await window.postSlack({ text, proxyUrl: trimmed }); console.debug('sendSlackMessage: retry via provided proxy'); }catch(e){ console.warn('postSlack retry failed', e); }
            }
          }catch(e){ console.warn('sendSlackMessage prompt failed', e); }
        }
          return res;
      }catch(e){ console.warn('postSlack failed', e); }
    }
  }catch(e){ console.warn('sendSlackMessage (main IPC) check failed', e); }

  // Fallback: use a proxy URL stored in localStorage (existing app UX)
  try{
    const saved = localStorage.getItem('SLACK_PROXY_URL');
    const proxy = (saved && saved.trim()) ? saved.trim() : null;
    if (proxy) {
      // best-effort, non-blocking
      try{ console.debug('sendSlackMessage: using fallback proxy', proxy);
        fetch(proxy, { method:'POST', mode:'no-cors', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ text }) }).catch(()=>{});
          return { status: 'ok', sentTo: 'proxy' };
        }catch(_){ }
    } else {
      // Nothing configured; silently ignore to avoid breaking UX
      console.info('No Slack proxy configured (sendSlackMessage skipped)');
        return { status: 'ignored', reason: 'no_target_configured' };
    }
  }catch(e){ console.warn('sendSlackMessage fallback failed', e); }
    return { status: 'error', error: 'unknown' };
}
