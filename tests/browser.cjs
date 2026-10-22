const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const {createControl}=await import('../server/main.mjs');
 const port=18787,origin='http://127.0.0.1:'+port;
 const server=createControl({password:'UI-Test-only-928490!',publicUrl:origin});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 let browser;
 try {
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('#password').fill('UI-Test-only-928490!');await page.getByRole('button',{name:'Anmelden'}).click();
  await page.locator('#customerName').fill('INCrovax Testkunde');await page.getByRole('button',{name:'Kunde anlegen'}).click();
  await page.locator('#customerSelect option').waitFor({state:'attached'});await page.getByRole('button',{name:'Registrierungscode erzeugen'}).click();await page.waitForFunction(()=>document.querySelector('#code').textContent.length>20);
  const code=await page.locator('#code').textContent();
  const response=await page.request.post(origin+'/api/agent/enroll',{data:{code,name:'Windows-Testgerät',os:'Windows 11 Test'}});const device=await response.json();
  await page.getByRole('button',{name:'Support anfragen'}).click();
  const headers={Authorization:'Bearer '+device.token};let poll=await (await page.request.post(origin+'/api/agent/poll',{headers,data:{os:'Windows 11 Test'}})).json();
  const id=poll.session.id;
  await page.request.post(origin+'/api/agent/'+id+'/consent',{headers,data:{accept:true}});
  const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='#14302a';x.fillRect(0,0,640,360);x.fillStyle='#91ff00';x.font='28px sans-serif';x.fillText('INCrovax · Testbild',40,100);return c.toDataURL('image/jpeg').split(',')[1];});
  await page.request.post(origin+'/api/agent/'+id+'/frame',{headers:{...headers,'Content-Type':'image/jpeg'},data:Buffer.from(jpeg,'base64')});
  await page.waitForFunction(()=>document.querySelector('#screen').naturalWidth===640);
  await page.locator('#controlInput').check();await page.locator('#screen').click();
  await page.locator('#screen').press('A');await page.waitForTimeout(200);
  poll=await (await page.request.post(origin+'/api/agent/poll',{headers,data:{}})).json();if(!poll.events.some(e=>e.kind==='key'))throw new Error('No input arrived');
  await page.getByRole('button',{name:'Sitzung beenden'}).click();
  await page.waitForFunction(()=>document.querySelector('#session').hidden);
  
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('Browser flow passed: login, customer, enrollment, consent, frame display, input, session end; no JS errors.');
 } finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
