export const SOFRA_SHH = 'Şşş, sofradayız 🤫';

// A manual popover shares the browser top layer with dialogs without taking focus.
export function createFeedback({document,viewport,window,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let timer;
  const position=()=>{
    const el=document.querySelector('#toast');if(!el)return;
    const covered=viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0;
    el.style.setProperty('--feedback-bottom',`${Math.max(110,covered+16)}px`);
  };
  viewport?.addEventListener('resize',position);
  viewport?.addEventListener('scroll',position);
  function show(message,type='normal'){
    const el=document.querySelector('#toast');if(!el)return;
    const popover=typeof el.showPopover==='function';
    // Stay within the modal's accessible subtree; the popover still escapes
    // its clipping/transform context through the browser top layer.
    const parent=document.querySelector('dialog[open]')||document.body;
    if(el.parentElement!==parent)parent.append(el);
    el.textContent=message;
    el.className=`visible ${type==='sofra-shh'?'sofra-shh':type==='spam'?'spam':''}`;
    position();
    if(popover&&!el.matches(':popover-open'))el.showPopover();
    clearTimer(timer);
    timer=setTimer(()=>{el.className='';if(popover&&el.matches(':popover-open'))el.hidePopover();},type==='sofra-shh'?5000:4200);
  }
  return {show};
}
