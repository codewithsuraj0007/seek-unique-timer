// renderer/ui/breakConfirm.js
/**
 * Provides an isolated break-confirm popup with a screen blocker and an ephemeral toast.
 * Exports:
 * - initBreakConfirm(): wires up DOM elements (safe to call multiple times)
 * - showBreakConfirmForHourly(): returns Promise<boolean>
 * - showToast(msg, type): shows an ephemeral toast
 */

export function initBreakConfirm(){
  // Create blocker if not present
  let blocker = document.getElementById('modalBlocker');
  if(!blocker){
    blocker = document.createElement('div');
    blocker.id = 'modalBlocker';
    Object.assign(blocker.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.45)', zIndex: '9998', display: 'none'
    });
    document.body.appendChild(blocker);
  }

  // Create toast container
  let toastWrap = document.getElementById('ephemeralToastWrap');
  if(!toastWrap){
    toastWrap = document.createElement('div');
    toastWrap.id = 'ephemeralToastWrap';
    Object.assign(toastWrap.style, {
      position: 'fixed', right: '16px', top: '16px', zIndex: '10010', pointerEvents: 'none'
    });
    document.body.appendChild(toastWrap);
  }

  return { blocker, toastWrap };
}

export function showToast(message, type='info', duration=2500){
  const { toastWrap } = initBreakConfirm();
  const el = document.createElement('div');
  el.className = 'ephemeral-toast ' + type;
  Object.assign(el.style, {
    marginTop: '8px', background: '#111', color: '#fff', padding: '10px 14px', borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)', transform: 'translateY(-6px)', opacity: '0', transition: 'all 220ms ease', pointerEvents: 'auto', fontWeight: '600'
  });
  el.textContent = message;
  toastWrap.appendChild(el);
  // animate in
  requestAnimationFrame(()=>{ el.style.transform = 'translateY(0)'; el.style.opacity = '1'; });
  setTimeout(()=>{
    // animate out
    el.style.transform = 'translateY(-6px)'; el.style.opacity = '0';
    setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 250);
  }, duration);
}

let __isBreakConfirmOpen = false;
export function showBreakConfirmForHourly(){
  return new Promise((resolve)=>{
    const modal = document.getElementById('breakConfirmModal');
    const yes = document.getElementById('breakConfirmYes');
    const no = document.getElementById('breakConfirmNo');
    const { blocker } = initBreakConfirm();

    if(!modal || !yes || !no){ resolve(false); return; }
    if(__isBreakConfirmOpen){ resolve(false); return; }
    __isBreakConfirmOpen = true;

    const cleanup = ()=>{
      try{ yes.removeEventListener('click', onYes); }catch(_){}
      try{ no.removeEventListener('click', onNo); }catch(_){}
      try{ modal.classList.remove('show'); }catch(_){}
      try{ blocker.style.display = 'none'; }catch(_){}
      __isBreakConfirmOpen = false;
    };

    const onYes = ()=>{ try{ cleanup(); showToast('Break started', 'success'); resolve(true); }catch(e){ cleanup(); resolve(false); } };
    const onNo  = ()=>{ try{ cleanup(); showToast('Continuing work', 'muted'); resolve(false); }catch(e){ cleanup(); resolve(false); } };

    yes.addEventListener('click', onYes, { once: true });
    no.addEventListener('click', onNo, { once: true });
    try{ blocker.style.display = 'block'; modal.classList.add('show'); }catch(e){ /* ignore */ }
  });
}
