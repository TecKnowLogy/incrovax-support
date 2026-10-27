const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
 const root=path.resolve('branding/ci-package');const css=fs.readFileSync(root+'/theme.css','utf8')+'\n'+fs.readFileSync(root+'/navigation.css','utf8');const js=fs.readFileSync(root+'/branding.js','utf8');
 fs.mkdirSync('out/browser',{recursive:true});const results=[];
 const cases={
 login:'<div id="backgroundImage" style="background-image:url(welcome.png)"></div><div id="logincell"><div id="loginpanel" style="padding:24px;width:280px;margin:100px auto"><h2>INCrovax Fernwartung</h2><input type="text" placeholder="Benutzername"><br><input type="password" placeholder="Passwort"><p><input type="submit" value="Anmelden"></p><a href="#">Sicherheitscode verwenden</a></div></div>',
 devices:'<h1>Meine Geräte</h1><div id="devListToolbarSpan">Filter <input placeholder="Gerät suchen"><select><option>Alle Geräte</option></select></div><h3>Testkunde</h3><div class="style3x" style="padding:15px;width:300px"><div class="i1"></div>ARBEITSPLATZ-01<br>Agent, eingeschaltet</div><h3>Server</h3><div class="style3x" style="padding:15px;width:300px">SERVER-01<br>Agent, eingeschaltet</div>',
 account:'<h1>Mein Konto</h1><h3>Konto-Sicherheit</h3><a>Authentifikator-App verwalten</a><br><a>Sicherheitscodes verwalten</a><h3>Konto-Aktionen</h3><a>Benachrichtigungseinstellungen</a><h3>Gerätegruppen</h3><div class="style3x" style="padding:15px;width:300px"><div class="mi" style="width:50px;height:50px;display:inline-block"></div>Testkunde – Gesamtadministrator</div>',
 agent:'<div id="dialog"><div id="dialogHeader">Mesh-Agenten hinzufügen</div><div id="dialogBody"><label>Betriebssystem <select><option>MeshCentral-Assistent</option><option>Windows</option></select></label><p>MeshCentral Assistant is a Windows tool that users can use to ask for help.</p><div id="agins_assistant2"><a id="asinslnk2" name="meshagents?id=10006">Assistant for Windows</a><img src="images/link4.png"></div><p>Mesh-Agent Windows x86-64 (.exe)</p></div></div>',
 help:'<div id="dialog"><div id="dialogHeader">Hilfeanfragen – TEST-PC</div><div id="dialogBody"><div style="background-color:#CCC;padding:12px"><a style="float:right">Verwerfen</a><strong>TEST-PC\\Benutzer</strong><p>Test der Hilfeanfrage, keine Störung.</p></div><p><button>OK</button></p></div></div>',
 notification:'<h1>Meine Geräte</h1><div id="notifiyBox" style="padding:20px"><div class="notification" style="padding:12px"><div>TEST-PC: Hilfe angefordert</div><div>27.10.2026, 14:31</div></div></div>',
 files:'<h1>Meine Dateien</h1><div id="p5filehead" style="padding:12px">Dateiname · Größe · Geändert</div><div class="g1" style="padding:12px">Installationspakete</div><div class="g2" style="padding:12px">Dokumentation</div><p><button>Hochladen</button> <button disabled>Löschen</button></p>',
 forms:'<div id="dialog"><div id="dialogHeader">Befehle ausführen</div><div id="dialogBody"><select><option>Windows PowerShell</option></select><p><select><option>Als Agent ausführen</option></select></p><textarea rows="6" cols="35">whoami</textarea><p><input type="checkbox" checked> Ausgabe anzeigen</p><button>OK</button> <button>Abbrechen</button></div></div>',
 safety:'<h1>MeshCentral</h1><pre>MeshCentral server log</pre><input value="MeshCentral customer text"><div data-incrovax-preserve>MeshCentral stored note</div><p>Copyright MeshCentral Apache license</p><a href="meshagents?id=4">Mesh-Agent</a>'
 };
 for(const [name,markup] of Object.entries(cases)){
  await page.setContent('<!doctype html><html><head><style>'+css+'\nbody{padding:24px}#dialog{width:440px;margin:60px auto}#dialogHeader,#dialogBody{padding:12px}#page_leftbar{position:fixed;left:0;top:0;width:72px}</style></head><body class="'+(name==='login'?'login':'night')+'">'+markup+'</body></html>');
  await page.evaluate(()=>{delete window.__incrovaxIdentity});await page.addScriptTag({content:js});await page.waitForTimeout(150);
  if(name==='agent'){
   if((await page.locator('body').innerText()).match(/meshcentral|mesh[- ]?agent/i))throw Error('Agent text remains');
   if(await page.locator('#incrovax-assistant-download').getAttribute('href')!=='downloads/INCrovax-Support-Assistant.exe')throw Error('Download path');
   if(await page.locator('#asinslnk2').getAttribute('name')!=='meshagents?id=10006')throw Error('Backend link changed');
  }
  if(name==='safety'){
   if(await page.locator('pre').innerText()!=='MeshCentral server log')throw Error('Log mutated');
   if(await page.locator('input').inputValue()!=='MeshCentral customer text')throw Error('Input mutated');
   if(await page.locator('[data-incrovax-preserve]').innerText()!=='MeshCentral stored note')throw Error('Preserved data mutated');
   if(await page.locator('a').getAttribute('href')!=='meshagents?id=4')throw Error('Agent URL mutated');
  }
  const checks=await page.evaluate(()=>{
   function rgb(s){return (s.match(/[\d.]+/g)||[]).slice(0,3).map(Number)}
   function lum(c){return c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
   let rows=[];for(const e of document.querySelectorAll('input:not([type=checkbox]),select,textarea,#dialogHeader,#dialogBody,#notifiyBox .notification')){
    let st=getComputedStyle(e),fg=rgb(st.color),bg=rgb(st.backgroundColor);if(st.backgroundColor==='rgba(0, 0, 0, 0)')continue;
    const f=lum(fg),b=lum(bg),ratio=(Math.max(f,b)+.05)/(Math.min(f,b)+.05);rows.push({element:e.id||e.tagName,ratio:+ratio.toFixed(2)});
   }return rows;
  });for(const row of checks)if(row.ratio<4.5)throw Error(name+' contrast '+JSON.stringify(row));
  await page.screenshot({path:'out/browser/'+name+'.png',fullPage:true});results.push({name,checks});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'out/browser/mobile.png',fullPage:true});
 fs.writeFileSync('out/browser/RESULTS.json',JSON.stringify({type:'Representative DOM fixtures; not an authenticated live server audit',cases:results},null,2));await browser.close();console.log('9 representative browser fixtures passed, contrast and data preservation checks passed.');
})().catch(e=>{console.error(e);process.exit(1)});
