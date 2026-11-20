/* Runs in the head, before application code. CSP allows self-hosted scripts only. */
(() => {
  'use strict';
  const KEY='canopia_privacy_v1', VERSION=1, TTL=180*86400000;
  const optional=document.documentElement.dataset.privacyOptional==='true';
  const memory=new Map();
  const storage={
    getItem(key){try{return localStorage.getItem(key);}catch{return memory.get(key)??null;}},
    setItem(key,value){memory.set(key,String(value));try{localStorage.setItem(key,String(value));}catch{}},
    removeItem(key){memory.delete(key);try{localStorage.removeItem(key);}catch{}}
  };
  function parse(raw){try{const p=JSON.parse(raw);return p?.version===VERSION&&Number.isFinite(p.at)&&p.at<=Date.now()&&Date.now()-p.at<TTL&&typeof p.analytics==='boolean'&&typeof p.personalization==='boolean'?p:null;}catch{return null;}}
  let preference=parse(storage.getItem(KEY));
  const allowed=category=>optional&&!!preference&&Date.now()-preference.at<TTL&&!!preference[category];
  function clean(){if(!allowed('personalization'))storage.removeItem('canopia_search_history');}
  clean();
  let dialog, banner, openButton;
  function refresh(){
    if(preference&&Date.now()-preference.at>=TTL)preference=null;
    if(banner)banner.hidden=!!preference||!!document.querySelector('.is-open[aria-hidden="false"],dialog[open]')||!finished;
  }
  const requests=new Set();
  const Privacy={
    storage,allowed,
    track(url,body){
      if(!allowed('analytics'))return;
      const controller=new AbortController();requests.add(controller);
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Canopia-Consent':'analytics-v1'},body:JSON.stringify(body),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>{}).finally(()=>requests.delete(controller));
    },
    open(){if(!dialog)return;openButton=document.activeElement;dialog.querySelectorAll('[data-category]').forEach(input=>input.checked=allowed(input.dataset.category));dialog.showModal();refresh();},
    save(values){
      preference={version:VERSION,at:Date.now(),analytics:optional&&values.analytics===true,personalization:optional&&values.personalization===true};
      storage.setItem(KEY,JSON.stringify(preference));
      if(!preference.analytics){for(const controller of requests)controller.abort();requests.clear();}
      clean();refresh();window.dispatchEvent(new CustomEvent('canopia:privacychange',{detail:{...preference}}));
    }
  };
  window.CanopiaPrivacy=Privacy;
  let finished=false, exiting=false, prepared=false, failed=false;
  let frameId, watchdog, exitTimer, finishStarted=0, finishDuration=0, finishFrom=0, burn=0;
  const entry=document.getElementById('canopia-entry');
  const paperMask=entry?.querySelector('.joint-paper-mask');
  const burningTip=entry?.querySelector('.joint-burning-tip');
  const coal=entry?.querySelector('.joint-coal');
  const ash=entry?.querySelector('.joint-ash');
  const firstEntry=!!entry&&!window.CanopiaEntrySeen;
  const started=performance.now(), minimum=4000;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const boot={state:'initial',minimumDuration:minimum,async ready(){
    const logo=entry?.querySelector('.entry-logo-image');
    if(logo?.decode)await Promise.race([logo.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,350))]);
    prepare(false);
  },fail(){prepare(true);}};
  window.CanopiaBoot=boot;
  function release(){
    if(finished)return;finished=true;boot.state='complete';
    document.documentElement.dataset.entrySeen='true';
    clearTimeout(watchdog);clearTimeout(exitTimer);cancelAnimationFrame(frameId);
    performance.mark('canopia-entry-complete');entry?.remove();
    refresh();window.dispatchEvent(new Event('canopia:entrycomplete'));
  }
  function prepare(error){
    if(prepared||finished)return;
    prepared=true;failed=error;clearTimeout(watchdog);
    performance.mark('canopia-app-prepared');
    finishStarted=performance.now();finishFrom=burn;
    // This is a brand animation, not a percentage of bytes downloaded.
    finishDuration=Math.max(minimum-(finishStarted-started),420);
  }
  function draw(value){
    const x=20+276*value;
    paperMask?.setAttribute('x',String(x));
    paperMask?.setAttribute('width',String(276*(1-value)));
    burningTip?.setAttribute('transform',`translate(${x} 0)`);
    coal?.setAttribute('ry',String(15-6*value));
    ash?.setAttribute('transform',`translate(0 46) scale(1 ${1-.4*value}) translate(0 -46)`);
  }
  function end(){
    if(exiting||finished)return;
    exiting=true;draw(1);entry.classList.add('is-consumed');
    boot.state=failed?'error':'ready';entry.dataset.state='ready';
    performance.mark('canopia-entry-ready');
    const text=entry.querySelector('.entry-status');if(text)text.textContent=failed?'Podés continuar; algunos datos podrían no estar disponibles.':'Listo';
    if(reduced){release();return;}
    // Briefly show only the remaining filter before opening the beige panels.
    exitTimer=setTimeout(()=>{
      boot.state='exiting';entry.dataset.state='exiting';
      entry.querySelector('.entry-panel-right')?.addEventListener('transitionend',release,{once:true});
      exitTimer=setTimeout(release,1000);
    },300);
  }
  function tick(now){
    if(finished||exiting)return;
    burn=prepared?finishFrom+(1-finishFrom)*Math.min((now-finishStarted)/finishDuration,1):.94*(1-Math.exp(-(now-started)/2900));
    if(!reduced)draw(burn);
    if(prepared&&now-started>=minimum&&burn>=1){end();return;}
    frameId=requestAnimationFrame(tick);
  }
  if(firstEntry){
    // Remember the first entry even if the visitor reloads during its animation.
    try{sessionStorage.setItem('canopia_entry_seen_v2','1');}catch{}
    watchdog=setTimeout(()=>prepare(true),15000);
    frameId=requestAnimationFrame(tick);
  }else release();
  window.addEventListener('pageshow',event=>{if(event.persisted)release();});
  // Do not strand keyboard users behind the decorative entrance.
  window.addEventListener('keydown',event=>{if(!finished&&(event.key==='Tab'||event.key==='Escape'))release();},true);
  document.addEventListener('DOMContentLoaded',()=>{
    if(boot.state==='initial')boot.state='preparing';
    if(!firstEntry)release();
    const container=document.createElement('div');
    container.innerHTML=`<section class="privacy-banner" hidden aria-label="Privacidad y cookies"><strong>Tu privacidad, a tu manera</strong><p>${optional?'Usamos almacenamiento necesario para la tienda. Solo con tu permiso medimos visitas y recordamos búsquedas.':'Usamos almacenamiento necesario para el carrito y las sesiones. Esta versión no incorpora seguimiento opcional.'} <a href="/cookies.html">Política de cookies</a>.</p><div class="privacy-actions">${optional?'<button type="button" data-accept>Aceptar opcionales</button><button type="button" data-reject>Rechazar opcionales</button>':'<button type="button" data-reject>Entendido</button>'}<button type="button" data-customize>Personalizar</button></div></section><dialog class="privacy-dialog" aria-labelledby="privacy-title"><h2 id="privacy-title">Preferencias de privacidad</h2><p>Podés cambiar tu decisión en cualquier momento desde el pie de página.</p><div class="privacy-category"><strong>Necesarias · siempre activas</strong><small>Carrito, favoritos solicitados, sesiones y seguridad. No se utilizan para publicidad.</small></div>${optional?'<label class="privacy-category"><input type="checkbox" data-category="analytics"> Analítica opcional<small>Contar visitas y vistas de productos en nuestra base D1, sin un identificador de visitante.</small></label><label class="privacy-category"><input type="checkbox" data-category="personalization"> Personalización opcional<small>Recordar hasta seis búsquedas en este navegador.</small></label>':''}<p><a href="/privacidad.html">Privacidad</a> · <a href="/cookies.html">Cookies</a></p><div class="privacy-actions"><button type="button" data-save>Guardar preferencias</button><button type="button" data-withdraw>Retirar opcionales</button><button type="button" data-close>Cerrar</button></div></dialog>`;
    document.body.append(container);banner=container.querySelector('section');dialog=container.querySelector('dialog');
    banner.querySelector('[data-accept]')?.addEventListener('click',()=>Privacy.save({analytics:true,personalization:true}));
    banner.querySelector('[data-reject]').addEventListener('click',()=>Privacy.save({}));
    banner.querySelector('[data-customize]').addEventListener('click',()=>Privacy.open());
    dialog.querySelector('[data-save]').addEventListener('click',()=>{const values={};dialog.querySelectorAll('[data-category]').forEach(i=>values[i.dataset.category]=i.checked);Privacy.save(values);dialog.close();});
    dialog.querySelector('[data-withdraw]').addEventListener('click',()=>{Privacy.save({});dialog.close();});
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{openButton?.focus({preventScroll:true});refresh();});
    document.addEventListener('click',event=>{if(event.target.closest('[data-privacy-open]'))Privacy.open();});
    new MutationObserver(refresh).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
    refresh();
  });
  window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null){preference=parse(storage.getItem(KEY));if(!allowed('analytics'))for(const controller of requests)controller.abort();clean();refresh();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){preference=parse(storage.getItem(KEY));clean();refresh();}});
})();
