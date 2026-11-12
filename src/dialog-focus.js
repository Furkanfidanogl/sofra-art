// Native dialog handles the focus trap; remember a stable opener across DOM rerenders.
export function createDialogFocus(document){
  const openers=new WeakMap();
  function remember(dialog,active,previous){
    if(previous?.contains(active)){
      const original=openers.get(previous);if(original)openers.set(dialog,original);return;
    }
    if(!active||active===document.body)return;
    openers.set(dialog,{node:active,action:active.dataset?.action,id:active.dataset?.id,label:active.getAttribute?.('aria-label'),href:active.getAttribute?.('href'),elementId:active.id});
  }
  function restore(dialog){
    const opener=dialog&&openers.get(dialog);if(!opener)return;
    let target=opener.node?.isConnected?opener.node:null;
    if(!target&&opener.elementId)target=document.getElementById(opener.elementId);
    if(!target&&(opener.action||opener.href))target=[...document.querySelectorAll('button,a,input,textarea,select,[tabindex]')].find(el=>opener.action?el.dataset?.action===opener.action&&el.dataset?.id===opener.id&&el.getAttribute('aria-label')===opener.label:el.getAttribute('href')===opener.href);
    if(target&&!target.disabled)target.focus({preventScroll:true});
    openers.delete(dialog);
  }
  return {remember,restore};
}
