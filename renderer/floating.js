const $ = (id)=>document.getElementById(id);
const fType  = $('fType');
const fTime  = $('fTime');
const fStart = $('fStart');
const btnBreak = $('btnBreak');

function fmt(sec){
  sec=Number(sec)||0;
  const h=String(Math.floor(sec/3600)).padStart(2,'0');
  const m=String(Math.floor((sec%3600)/60)).padStart(2,'0');
  const s=String(Math.floor(sec%60)).padStart(2,'0');
  return `${h}:${m}:${s}`;
}

btnBreak?.addEventListener('click', ()=>{
  window.floatingAPI?.requestBreak?.();
});

window.floatingAPI?.onTimerShow?.((data)=>{
  fType.textContent  = String(data?.type||'—').toUpperCase();
  fStart.textContent = 'Start: ' + (data?.startLabel || '--:--');
});
window.floatingAPI?.onTimerUpdate?.((data)=>{
  fTime.textContent = fmt(Number(data?.elapsed||0));
});
window.floatingAPI?.onTimerHide?.(()=>{
  fType.textContent  = '—';
  fStart.textContent = 'Start: --:--';
  fTime.textContent  = '00:00:00';
});
