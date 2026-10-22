let csrf = '', selectedSession = null, busy = false, frameUrl = null, lastMove = 0;
let inputTail=Promise.resolve(), inputQueued=0;
const pressedKeys=new Set(), pressedButtons=new Set();
let lastPosition={x:0.5,y:0.5};
const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await r.json();
  if (!r.ok) { if (r.status === 401) { $('console').hidden = true; $('login').hidden = false; } throw new Error(value.error || 'Anfrage fehlgeschlagen'); }
  return value;
}
const handle = fn => async event => { event?.preventDefault(); try { message(''); await fn(event); } catch (err) { message(err.message); } };
function element(tag, text, cls) { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; }
async function refresh() {
  const [customers, devices] = await Promise.all([api('/api/customers'), api('/api/devices')]);
  const prior = $('customerSelect').value; $('customerSelect').replaceChildren();
  for (const c of customers) { const o = element('option', c.name); o.value = c.id; $('customerSelect').append(o); }
  if (customers.some(c => c.id === prior)) $('customerSelect').value = prior;
  $('summary').textContent = `${customers.length} Kunden · ${devices.filter(d => d.online).length} von ${devices.length} Geräten online`;
  $('devices').replaceChildren();
  if (!devices.length) $('devices').append(element('p', 'Lege einen Kunden an und registriere dein erstes Testgerät.'));
  for (const d of devices) {
    const card = element('article', '', 'card');
    card.append(element('h3', d.name), element('span', d.online ? '● Online' : '● Offline', d.online ? 'online' : 'offline'), element('p', customers.find(c => c.id === d.customerId)?.name || 'Kunde'), element('p', d.os));
    const connect = element('button', 'Support anfragen'); connect.disabled = !d.online || !!selectedSession;
    connect.onclick = handle(async () => { selectedSession = await api('/api/sessions','POST',{ deviceId:d.id }); $('session').hidden = false; $('sessionTitle').textContent = d.name; $('controlInput').checked = false; await updateSession(); });
    const revoke = element('button', 'Zugang sperren', 'secondary'); revoke.onclick = handle(async () => { if (confirm('Gerätezugang sperren? Eine erneute Registrierung wird erforderlich.')) { await api('/api/devices/' + d.id,'DELETE'); await refresh(); } });
    card.append(connect, revoke); $('devices').append(card);
  }
}
function clearFrame() { if (frameUrl) URL.revokeObjectURL(frameUrl); frameUrl = null; $('screen').removeAttribute('src'); $('controlInput').checked = false; }
async function updateSession() {
  if (!selectedSession) return;
  const id = selectedSession.id, s = await api('/api/sessions/' + id);
  if (selectedSession?.id !== id) return;
  selectedSession = s;
  $('sessionStatus').textContent = ({requested:'Warten auf ausdrückliche Freigabe am Testgerät …',active:'Freigegeben · Die Person am Testgerät kann jederzeit beenden.',denied:'Die Anfrage wurde abgelehnt.',ended:'Die Sitzung ist beendet.'})[s.state];
  if (s.state !== 'active') clearFrame();
  if (['denied','ended'].includes(s.state)) { selectedSession = null; return; }
  if (s.state === 'active') {
    const r = await fetch('/api/sessions/' + id + '/frame');
    if (r.status === 200) { const blob = await r.blob(); if (selectedSession?.id !== id || selectedSession.state !== 'active') return; if (frameUrl) URL.revokeObjectURL(frameUrl); frameUrl = URL.createObjectURL(blob); $('screen').src = frameUrl; }
  }
}
$('loginForm').onsubmit = handle(async () => { const r = await api('/api/login','POST',{ password:$('password').value }); csrf = r.csrf; $('password').value = ''; $('login').hidden = true; $('console').hidden = false; await refresh(); });
$('customerForm').onsubmit = handle(async () => { await api('/api/customers','POST',{ name:$('customerName').value }); $('customerName').value = ''; await refresh(); });
$('enrollForm').onsubmit = handle(async () => { const r = await api('/api/enrollments','POST',{ customerId:$('customerSelect').value }); $('code').textContent = r.code; });
$('logout').onclick = handle(async () => { await api('/api/logout','POST',{}); selectedSession = null; clearFrame(); $('console').hidden = true; $('login').hidden = false; });
$('endSession').onclick = handle(async () => { if (selectedSession) await api('/api/sessions/' + selectedSession.id + '/end','POST',{}); selectedSession = null; clearFrame(); $('session').hidden = true; await refresh(); });
function sendInput(e, force=false) {
  if (!selectedSession || selectedSession.state !== 'active' || (!force && !$('controlInput').checked)) return;
  if(inputQueued >= 30) { $('controlInput').checked=false; message('Verbindung zu langsam. Bitte Sitzung beenden und erneut verbinden.'); return; }
  const id=selectedSession.id; inputQueued++;
  inputTail=inputTail.then(async()=>{ if(selectedSession?.id===id && selectedSession.state==='active') await api('/api/sessions/'+id+'/input','POST',e); }).catch(err=>{ $('controlInput').checked=false; message(err.message); }).finally(()=>inputQueued--);
}
function releaseInput() {
  for(const key of pressedKeys) sendInput({kind:'key',key,down:false},true);
  for(const button of pressedButtons) sendInput({kind:'button',button,down:false,...lastPosition},true);
  pressedKeys.clear();pressedButtons.clear();
}
const position = e => { const b = $('screen').getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)), y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height)) }; };
$('screen').onmousemove = e => { if (Date.now()-lastMove < 80) return; lastMove=Date.now(); lastPosition=position(e); sendInput({kind:'move',...lastPosition}); };
$('screen').onmousedown = e => { e.preventDefault(); $('screen').focus(); if(!$('controlInput').checked || ![0,2].includes(e.button)) return; lastPosition=position(e); pressedButtons.add(e.button); sendInput({kind:'button',button:e.button,down:true,...lastPosition}); };
window.addEventListener('mouseup',e=>{ if(pressedButtons.has(e.button)){ pressedButtons.delete(e.button); sendInput({kind:'button',button:e.button,down:false,...lastPosition},true); } });
$('screen').oncontextmenu = e => e.preventDefault();
$('screen').onwheel = e => { if ($('controlInput').checked) { e.preventDefault(); sendInput({kind:'scroll',delta:e.deltaY > 0 ? -1 : 1}); } };
for (const [event,down] of [['keydown',true],['keyup',false]]) $('screen').addEventListener(event,e => { if ($('controlInput').checked) { e.preventDefault(); if (!e.repeat) { const allowed=/^[a-zA-Z0-9]$/.test(e.key)||['Enter','Escape','Tab','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Shift','Control','Alt',' '].includes(e.key); if(allowed){ if(down) pressedKeys.add(e.key); else pressedKeys.delete(e.key); sendInput({kind:'key',key:e.key,down}); } } } });
window.addEventListener('blur', () => { releaseInput(); $('controlInput').checked = false; });
$('screen').addEventListener('blur',releaseInput);
$('controlInput').addEventListener('change',()=>{if(!$('controlInput').checked)releaseInput();});
setInterval(async () => { if (busy || $('console').hidden) return; busy=true; try { await updateSession(); await refresh(); } catch (err) { message(err.message); clearFrame(); } finally { busy=false; } },1500);
try { const me = await api('/api/me'); csrf=me.csrf; $('login').hidden=true; $('console').hidden=false; await refresh(); } catch {}
