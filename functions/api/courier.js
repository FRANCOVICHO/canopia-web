import { dbFor, json, failure, configuration, errorResponse, bodyJson, field, randomToken, digest, verifyPassword, cookies, cookie, getSession, publicAccount, assertChanged, atomic, deliveryEvent } from '../_lib/couriers.js';

export async function onRequest({request, env}) {
  try {
    configuration(env);
    const db = dbFor(env);
    const action = new URL(request.url).searchParams.get('action') || 'sync';
    if (request.method === 'POST' && action === 'entry') {
      const body = await bodyJson(request);
      const key = field(body, 'key', 64, true);
      const account = await db.prepare('SELECT id FROM couriers WHERE access_key=? AND active=1').bind(key).first();
      if (!account) failure('El enlace de acceso no está disponible.',403);
      return json({allowed:true},200,{'Set-Cookie':cookie(request,'canopia_courier_entry',key,30*86400)});
    }
    if (request.method === 'POST' && action === 'login') {
      const body = await bodyJson(request);
      const username = field(body,'username',64,true).toLowerCase();
      const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
      const now = Date.now();
      // Independent account and IP budgets; atomic increments also limit concurrent attempts.
      await db.prepare('DELETE FROM courier_login_limits WHERE expires_at<=?').bind(now).run();
      const keys = await Promise.all([digest(`ip:${request.headers.get('CF-Connecting-IP') || 'local'}`),digest(`account:${username}`)]);
      for (const [i,key] of keys.entries()) {
        const result = await db.prepare(`INSERT INTO courier_login_limits(key,attempts,expires_at) VALUES (?,1,?)
          ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
          expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`)
          .bind(key,now+15*60000,now,now).first();
        if (result.attempts > (i === 0 ? 40 : 10)) return json({error:'Demasiados intentos. Probá de nuevo en 15 minutos.'},429,{'Retry-After':'900'});
      }
      const account = await db.prepare('SELECT * FROM couriers WHERE username=? COLLATE NOCASE').bind(username).first();
      if (!await verifyPassword(password,account?.password_hash,env) || !account?.active) failure('Usuario o contraseña incorrectos.',401);
      const token = randomToken();
      // Re-check password and active status to close a reset/suspension racing this login.
      await atomic(db,[
        db.prepare('DELETE FROM courier_sessions WHERE expires_at<=?').bind(now),
        db.prepare('DELETE FROM courier_login_limits WHERE expires_at<=?').bind(now),
        db.prepare(`INSERT INTO courier_sessions(token_hash,courier_id,expires_at)
          SELECT ?,id,? FROM couriers WHERE id=? AND active=1 AND password_hash=? AND version=?`)
          .bind(await digest(token),now+account.session_hours*3600000,account.id,account.password_hash,account.version),assertChanged(db),
      ]);
      const response = json({ok:true,courier:publicAccount(account)});
      response.headers.append('Set-Cookie',cookie(request,'canopia_courier_session',token,account.session_hours*3600));
      response.headers.append('Set-Cookie',cookie(request,'canopia_courier_entry',account.access_key,30*86400));
      return response;
    }
    if (request.method === 'POST' && action === 'logout') {
      await bodyJson(request);
      const token = cookies(request).canopia_courier_session || '';
      await db.prepare('DELETE FROM courier_sessions WHERE token_hash=?').bind(await digest(token)).run();
      return json({ok:true},200,{'Set-Cookie':cookie(request,'canopia_courier_session','',0)});
    }
    const account = await getSession(request,db);
    if (request.method === 'GET' && action === 'me') {
      const entry = cookies(request).canopia_courier_entry;
      const allowed = !!account || (/^[a-f0-9]{64}$/.test(entry || '') && !!await db.prepare('SELECT id FROM couriers WHERE access_key=? AND active=1').bind(entry).first());
      return json({allowed:!!allowed,courier:account ? publicAccount(account) : null});
    }
    if (!account) failure('Iniciá sesión con tu cuenta de repartidor.',401);
    if (request.method === 'GET' && action === 'sync') {
      const {results} = await db.prepare(`SELECT * FROM deliveries WHERE courier_id=?
        AND (status IN ('pendiente','en_camino') OR updated_at>=datetime('now','-7 days'))
        ORDER BY CASE status WHEN 'pendiente' THEN 0 WHEN 'en_camino' THEN 1 ELSE 2 END,
        CASE priority WHEN 'urgente' THEN 0 ELSE 1 END,created_at DESC LIMIT 250`).bind(account.id).all();
      const deliveries = results.map(d=>{ if (!account.can_view_phone) delete d.customer_phone; return d; });
      return json({courier:publicAccount(account),deliveries,synced_at:new Date().toISOString()});
    }
    if (request.method === 'POST' && action === 'status') {
      const body = await bodyJson(request);
      if (!account.can_update_status) failure('Tu cuenta no tiene permiso para cambiar estados.',403);
      const id = field(body,'id',64,true), status = field(body,'status',32,true), note = field(body,'note',500);
      if (!Number.isSafeInteger(body.version)) failure('Falta la versión del pedido.');
      const delivery = await db.prepare('SELECT * FROM deliveries WHERE id=? AND courier_id=?').bind(id,account.id).first();
      if (!delivery) failure('Entrega no encontrada.',404);
      const transitions = {pendiente:['en_camino','no_entregado'],en_camino:['entregado','no_entregado']};
      if (!transitions[delivery.status]?.includes(status)) failure('El pedido ya cambió de estado. Actualizá la lista.',409);
      if (status === 'no_entregado' && !note) failure('Contá por qué no se pudo entregar.');
      await atomic(db,[
        db.prepare(`UPDATE deliveries SET status=?,result_note=?,version=version+1,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND courier_id=? AND version=? AND status=?
          AND EXISTS(SELECT 1 FROM couriers c JOIN courier_sessions s ON s.courier_id=c.id
            WHERE c.id=? AND c.active=1 AND c.can_update_status=1 AND s.token_hash=? AND s.expires_at>?)`)
          .bind(status,note,id,account.id,body.version,delivery.status,account.id,await digest(cookies(request).canopia_courier_session),Date.now()),
        assertChanged(db),deliveryEvent(db,id,`courier:${account.id}`,'status',delivery.status,status,note),
      ]);
      return json({ok:true});
    }
    return json({error:'Acción no encontrada.'},404);
  } catch(error) { return errorResponse(error); }
}
