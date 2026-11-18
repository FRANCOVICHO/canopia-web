(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const money = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'});
  const labels = {pendiente:'Pendiente',en_camino:'En camino',entregado:'Entregado',no_entregado:'No entregado',cancelado:'Cancelado'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let account, deliveries=[], filter='active', busy=false, timer, lastRender='', mutation=false, selected;
  let connected = navigator.onLine;
  async function api(action,body) {
    const response = await fetch(`/api/courier?action=${action}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'No se pudo conectar con Canopia.'),{status:response.status});
    return data;
  }
  function loggedOut(message='') {
    account=null;deliveries=[];lastRender='';clearTimeout(timer);
    $('#courier-login').hidden=false;$('#courier-workspace').hidden=true;$('#courier-deliveries').replaceChildren();
    $('#courier-login-message').textContent=message;
    if ($('#courier-status-dialog').open) $('#courier-status-dialog').close();
  }
  function schedule() { clearTimeout(timer); if(account) timer=setTimeout(sync,document.hidden?30000:3000); }
  async function sync() {
    if (!account || busy || mutation) { schedule();return; }
    busy=true;
    try {
      const data=await api('sync');account=data.courier;deliveries=data.deliveries;connected=true;
      $('#courier-login').hidden=true;$('#courier-workspace').hidden=false;
      $('#courier-greeting').textContent=`Hola, ${account.name.split(' ')[0]}.`;
      $('#courier-account-info').textContent=[account.zone,account.vehicle].filter(Boolean).join(' · ') || 'Tus entregas asignadas por Canopia.';
      $('#courier-sync').textContent=`Actualizado ${new Date(data.synced_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} · cada 3 s`;
      $('#courier-sync').classList.remove('is-offline');render();
    } catch(error) {
      connected=false;
      if(error.status===401) loggedOut(error.message);
      else { $('#courier-sync').textContent='Sin conexión. Los datos pueden estar desactualizados. Reintentando…';$('#courier-sync').classList.add('is-offline');render(); }
    } finally { busy=false;schedule(); }
  }
  function render() {
    const search=$('#courier-search').value.trim().toLowerCase();
    const signature=JSON.stringify([deliveries,account,filter,search,connected]);
    if(signature===lastRender)return;lastRender=signature;
    const counts=status=>deliveries.filter(d=>d.status===status).length;
    $('#courier-stats').innerHTML=`<div><strong>${counts('pendiente')}</strong><span>Pendientes</span></div><div><strong>${counts('en_camino')}</strong><span>En camino</span></div><div><strong>${counts('entregado')}</strong><span>Entregados · 7 días</span></div>`;
    const shown=deliveries.filter(d=>(filter==='active'?['pendiente','en_camino'].includes(d.status):!['pendiente','en_camino'].includes(d.status)) && `${d.customer_name} ${d.address} ${d.order_id||d.id}`.toLowerCase().includes(search));
    const active = document.activeElement;
    const focusId=active?.dataset.id,focusStatus=active?.dataset.status;
    $('#courier-deliveries').innerHTML=shown.length?shown.map(d=>{
      const address=[d.address,d.city].filter(Boolean).join(', ');
      const phone=(d.customer_phone||'').replace(/[^0-9+]/g,'');
      const canUpdate=account.can_update_status && connected;
      return `<article class="delivery-card"><div class="delivery-card-head"><span>${d.order_id?`COMPRA #${escape(d.order_id)}`:`ENVÍO ${escape(d.id.slice(0,8))}`}${d.priority==='urgente'?' · <b class="urgent">URGENTE</b>':''}</span><span class="delivery-status">${labels[d.status]}</span></div><div class="delivery-card-body"><h2>${escape(d.customer_name)}</h2><div class="delivery-address">${escape(address)}</div><div class="delivery-links"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" target="_blank" rel="noopener noreferrer">Ver dirección ↗</a>${phone?`<a href="tel:${escape(phone)}">Llamar al cliente</a>`:''}</div>${d.scheduled_at?`<p>Entrega prevista: ${escape(new Date(d.scheduled_at).toLocaleString('es-AR'))}</p>`:''}${d.contents?`<p><strong>Qué llevás</strong><br>${escape(d.contents)}</p>`:''}${d.details?`<p><strong>Indicaciones</strong><br>${escape(d.details)}</p>`:''}<p class="delivery-amount"><span>${d.payment_method==='pagado'?'Ya está pagado':`Cobrar · ${d.payment_method}`}</span><strong>${money.format(d.collect_cents/100)}</strong></p>${d.result_note?`<p>Observación: ${escape(d.result_note)}</p>`:''}<div class="delivery-card-actions">${d.status==='pendiente'?`<button class="primary" data-id="${escape(d.id)}" data-status="en_camino" ${canUpdate?'':'disabled'}>Salir a repartir</button>`:''}${d.status==='en_camino'?`<button class="primary" data-id="${escape(d.id)}" data-status="entregado" ${canUpdate?'':'disabled'}>Marcar entregado</button>`:''}${['pendiente','en_camino'].includes(d.status)?`<button class="secondary" data-id="${escape(d.id)}" data-status="no_entregado" ${canUpdate?'':'disabled'}>No pude entregar</button>`:''}</div></div></article>`;
    }).join(''):`<div class="delivery-empty"><span class="eyebrow">${search?'BÚSQUEDA':'TODO AL DÍA'}</span><h2>${search?'No hay coincidencias.':filter==='active'?'No tenés entregas pendientes.':'Todavía no hay entregas en el historial.'}</h2><p>${search?'Probá con otro nombre o dirección.':'Las nuevas asignaciones van a aparecer acá automáticamente.'}</p></div>`;
    if(focusId) [...$('#courier-deliveries').querySelectorAll('button')].find(b=>b.dataset.id===focusId&&b.dataset.status===focusStatus)?.focus({preventScroll:true});
  }
  $('#courier-login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;$('#courier-login-message').textContent='Verificando acceso…';
    try { const body=Object.fromEntries(new FormData(event.target));const data=await api('login',body);account=data.courier;event.target.password.value='';await sync(); }
    catch(error){$('#courier-login-message').textContent=error.message;}finally{button.disabled=false;}
  });
  $('#courier-logout').addEventListener('click',async event=>{event.target.disabled=true;try{await api('logout',{});loggedOut();}catch(error){$('#courier-notice').textContent=error.message;}finally{event.target.disabled=false;}});
  $('#courier-refresh').addEventListener('click',()=>{clearTimeout(timer);sync();});
  $('#courier-search').addEventListener('input',render);
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',b===button));render();}));
  $('#courier-deliveries').addEventListener('click',event=>{
    const button=event.target.closest('button[data-status]');if(!button)return;
    const delivery=deliveries.find(d=>d.id===button.dataset.id);if(!delivery)return;
    selected={id:delivery.id,version:delivery.version,status:button.dataset.status};
    $('#courier-status-title').textContent=labels[selected.status];
    $('#courier-status-copy').textContent=`${delivery.customer_name} · ${delivery.address}${selected.status==='entregado'&&delivery.collect_cents?` · Confirmá que cobraste ${money.format(delivery.collect_cents/100)}.`:''}`;
    $('#courier-status-form').reset();$('#courier-status-form').note.required=selected.status==='no_entregado';$('#courier-status-error').textContent='';$('#courier-status-dialog').showModal();
  });
  $('#courier-status-cancel').addEventListener('click',()=>$('#courier-status-dialog').close());
  $('#courier-status-form').addEventListener('submit',async event=>{
    event.preventDefault();event.submitter.disabled=true;mutation=true;
    try{await api('status',{...selected,note:event.target.note.value});$('#courier-status-dialog').close();$('#courier-notice').textContent='Estado actualizado.';}
    catch(error){$('#courier-status-error').textContent=error.message;}
    finally{event.submitter.disabled=false;mutation=false;await sync();}
  });
  addEventListener('online',()=>{connected=true;sync();});
  addEventListener('offline',()=>{connected=false;$('#courier-sync').textContent='Sin conexión. No se pueden guardar cambios.';$('#courier-sync').classList.add('is-offline');if(account)render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account){clearTimeout(timer);sync();}});
  (async()=>{
    try {
      const url=new URL(location.href),key=url.searchParams.get('access');
      if(key){history.replaceState(null,'',url.pathname);await api('entry',{key});}
      const data=await api('me');if(data.courier){account=data.courier;await sync();}
    }catch(error){$('#courier-login-message').textContent=error.message;}
  })();
})();
