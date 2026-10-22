import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createControl } from '../server/main.mjs';

const origin='http://127.0.0.1:8787', password='Test-only-Password-9295!';
async function setup(t, dataDir) {
  let clock=1000000;
  const server=createControl({password,publicUrl:origin,dataDir,now:()=>clock});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='',csrf='';
  const request=async (route,{method='GET',body,token,anonymous=false,headers={}}={})=>{
    const r=await fetch(base+route,{method,headers:{Origin:origin,...(!anonymous&&cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}
    return {r,value};
  };
  const login=async()=>{const x=await request('/api/login',{method:'POST',body:{password},anonymous:true});assert.equal(x.r.status,200);cookie=x.r.headers.get('set-cookie').split(';')[0];csrf=x.value.csrf;};
  const enroll=async()=>{
    const c=await request('/api/customers',{method:'POST',body:{name:'Testkunde'}});assert.equal(c.r.status,201);
    const ticket=await request('/api/enrollments',{method:'POST',body:{customerId:c.value.id}});
    const d=await request('/api/agent/enroll',{method:'POST',body:{code:ticket.value.code,name:'Test-PC',os:'Windows Test'},anonymous:true});assert.equal(d.r.status,200);
    return {...d.value,code:ticket.value.code};
  };
  return {request,login,enroll,advance:n=>{clock+=n;},base};
}
test('technician authentication, CSRF protection and single-use enrollment',async t=>{
  const s=await setup(t);
  assert.equal((await s.request('/api/devices',{anonymous:true})).r.status,401);
  assert.equal((await s.request('/api/login',{method:'POST',body:{password},headers:{Origin:'https://attacker.invalid'},anonymous:true})).r.status,403);
  await s.login();
  assert.equal((await s.request('/api/customers',{method:'POST',body:{name:'x'},headers:{'X-CSRF-Token':'wrong'}})).r.status,403);
  const d=await s.enroll();
  assert.equal((await s.request('/api/agent/enroll',{method:'POST',body:{code:d.code,name:'Second device'},anonymous:true})).r.status,403);
  const devices=(await s.request('/api/devices')).value;
  assert.equal(devices.length,1);assert.equal(devices[0].online,true);assert.equal(devices[0].tokenHash,undefined);
});
test('screen and input require consent from the matching device; end revokes both',async t=>{
  const s=await setup(t);await s.login();const d=await s.enroll(),other=await s.enroll();
  const session=(await s.request('/api/sessions',{method:'POST',body:{deviceId:d.id}})).value;
  const input={kind:'key',key:'A',down:true};
  assert.equal((await s.request('/api/sessions/'+session.id+'/input',{method:'POST',body:input})).r.status,409);
  assert.equal((await s.request('/api/agent/'+session.id+'/consent',{method:'POST',body:{accept:true},token:other.token,anonymous:true})).r.status,404);
  assert.equal((await s.request('/api/agent/'+session.id+'/consent',{method:'POST',body:{accept:true},token:d.token,anonymous:true})).value.state,'active');
  assert.equal((await s.request('/api/sessions/'+session.id+'/input',{method:'POST',body:input})).r.status,200);
  const poll=await s.request('/api/agent/poll',{method:'POST',body:{os:'Windows Test'},token:d.token,anonymous:true});assert.deepEqual(poll.value.events,[input]);
  const image=Buffer.from([255,216,255,217]);
  let r=await fetch(s.base+'/api/agent/'+session.id+'/frame',{method:'POST',headers:{Authorization:'Bearer '+d.token,'Content-Type':'image/jpeg'},body:image});assert.equal(r.status,200);
  assert.equal((await s.request('/api/sessions/'+session.id+'/frame')).r.status,200);
  assert.equal((await s.request('/api/sessions/'+session.id+'/input',{method:'POST',body:{kind:'key',key:'powershell -EncodedCommand foo',down:true}})).r.status,400);
  await s.request('/api/agent/'+session.id+'/end',{method:'POST',body:{},token:d.token,anonymous:true});
  assert.equal((await s.request('/api/sessions/'+session.id+'/frame')).r.status,204);
  assert.equal((await s.request('/api/sessions/'+session.id+'/input',{method:'POST',body:input})).r.status,409);
});
test('device decline, stale operator and revoked credentials fail closed',async t=>{
  const s=await setup(t);await s.login();const d=await s.enroll();
  let session=(await s.request('/api/sessions',{method:'POST',body:{deviceId:d.id}})).value;
  await s.request('/api/agent/'+session.id+'/consent',{method:'POST',body:{accept:false},token:d.token,anonymous:true});
  assert.equal((await s.request('/api/sessions/'+session.id)).value.state,'denied');
  session=(await s.request('/api/sessions',{method:'POST',body:{deviceId:d.id}})).value;
  await s.request('/api/agent/'+session.id+'/consent',{method:'POST',body:{accept:true},token:d.token,anonymous:true});
  s.advance(31000);
  assert.equal((await s.request('/api/sessions/'+session.id)).value.state,'ended');
  await s.request('/api/devices/'+d.id,{method:'DELETE'});
  assert.equal((await s.request('/api/agent/poll',{method:'POST',body:{},token:d.token,anonymous:true})).r.status,401);
});
test('persisted customer inventory survives restart; device secrets are hashed',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'incrovax-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const s=await setup(t,dir);await s.login();const d=await s.enroll();
  assert.equal(readFileSync(path.join(dir,'state.json'),'utf8').includes(d.token),false);
  const other=await setup(t,dir);await other.login();
  const list=(await other.request('/api/devices')).value;assert.equal(list.length,1);assert.equal(list[0].online,false);
});
test('login brute-force limits and enrollment expiration',async t=>{
  const s=await setup(t);
  for(let i=0;i<5;i++)assert.equal((await s.request('/api/login',{method:'POST',body:{password:'wrong'},anonymous:true})).r.status,401);
  assert.equal((await s.request('/api/login',{method:'POST',body:{password},anonymous:true})).r.status,429);
  s.advance(900001);await s.login();
  const c=(await s.request('/api/customers',{method:'POST',body:{name:'Customer'}})).value;
  const ticket=(await s.request('/api/enrollments',{method:'POST',body:{customerId:c.id}})).value;
  s.advance(600001);
  assert.equal((await s.request('/api/agent/enroll',{method:'POST',body:{code:ticket.code,name:'Expired'},anonymous:true})).r.status,403);
});
