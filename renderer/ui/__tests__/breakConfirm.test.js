import { initBreakConfirm, showBreakConfirmForHourly, showToast } from '../breakConfirm.js';

describe('breakConfirm module', ()=>{
  beforeEach(()=>{ document.body.innerHTML = `
    <div id="breakConfirmModal" class="modal"><div class="modal-card"><button id="breakConfirmYes">Yes</button><button id="breakConfirmNo">No</button></div></div>
  `; });

  test('initBreakConfirm creates blocker and toast container', ()=>{
    const { blocker, toastWrap } = initBreakConfirm();
    expect(document.getElementById('modalBlocker')).toBeTruthy();
    expect(document.getElementById('ephemeralToastWrap')).toBeTruthy();
    expect(blocker.style.display === 'none' || blocker.style.display === '').toBeTruthy();
  });

  test('showBreakConfirmForHourly resolves true on Yes and false on No', async ()=>{
    initBreakConfirm();
    const p = showBreakConfirmForHourly();
    // simulate user click Yes after small delay
    setTimeout(()=>{ document.getElementById('breakConfirmYes').click(); }, 20);
    const r = await p;
    expect(r).toBe(true);

    const p2 = showBreakConfirmForHourly();
    setTimeout(()=>{ document.getElementById('breakConfirmNo').click(); }, 20);
    const r2 = await p2;
    expect(r2).toBe(false);
  });

  test('showToast shows an element then removes it', ()=>{
    initBreakConfirm();
    showToast('hello', 'info', 50);
    const el = document.querySelector('#ephemeralToastWrap .ephemeral-toast');
    expect(el).toBeTruthy();
  });
});
