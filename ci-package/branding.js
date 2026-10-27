/* INCrovax presentation layer; no network, credentials, permissions or URLs changed. */
(() => {
  'use strict';
  if (window.__incrovaxIdentity) return;
  window.__incrovaxIdentity = true;
  const legalPage = /\/(?:terms|license|licence|notice)(?:[./?]|$)/i.test(location.pathname);
  if (legalPage) return;
  const substitutions = [
    [/MeshCentral[\s\u00a0\u2010-\u2015-]*(?:Assistant|Assistent)/gi, 'INCrovax Support Assistant'],
    [/MeshCentral[\s-]*Router/gi, 'Portweiterleitung'],
    [/MeshCentral/gi, 'INCrovax Fernwartung'],
    [/Mesh[\s\u00a0\u2010-\u2015-]*Agenten/gi, 'INCrovax-Agenten'],
    [/Mesh[\s\u00a0\u2010-\u2015-]*Agents/gi, 'INCrovax Support Agents'],
    [/Mesh[\s\u00a0\u2010-\u2015-]*Agent/gi, 'INCrovax Support Agent'],
    [/MeshMessenger/gi, 'INCrovax Support Chat'],
    [/MeshCmd/gi, 'Befehlswerkzeug']
  ];
  function brand(text) {
    if (!text || /copyright|©|apache|license|licence|urheber|lizenz|attribution/i.test(text)) return text;
    for (const [pattern, replacement] of substitutions) text = text.replace(pattern, replacement);
    return text;
  }
  function excluded(element) {
    return !element || element.closest('script,style,noscript,textarea,input,pre,code,canvas,svg,[contenteditable],.terminal,.xterm,#p15agentConsole,#p15agentConsoleText,#p3events,#p16events,#p10log,#p13log,#p15console,#p15ConsoleText,.logoutput,[data-incrovax-preserve],a[href*="license"],a[href*="terms"],a[href*="github.com"]');
  }
  function paint(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!excluded(root.parentElement)) {
        const value = brand(root.nodeValue);
        if (value !== root.nodeValue) root.nodeValue = value;
      }
      return;
    }
    if (!(root instanceof Element) || excluded(root)) return;
    const elements = [root, ...root.querySelectorAll('[title],[alt],input[type="button"],input[type="submit"]')];
    for (const element of elements) {
      if (element.closest('pre,code,.terminal,.xterm,[contenteditable]')) continue;
      if (!element.matches('input') && !excluded(element)) {
        for (const attribute of ['title','alt']) {
          if (element.hasAttribute(attribute)) {
            const old = element.getAttribute(attribute), value = brand(old);
            if (old !== value) element.setAttribute(attribute, value);
          }
        }
      }
      if (element.matches('input[type="button"],input[type="submit"]')) {
        const value = brand(element.value);
        if (value !== element.value) element.value = value;
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!excluded(node.parentElement)) {
        const value = brand(node.nodeValue);
        if (value !== node.nodeValue) node.nodeValue = value;
      }
    }
  }
  function assistantLink() {
    const old = document.getElementById('asinslnk2');
    if (!old || document.getElementById('incrovax-assistant-download')) return;
    const link=document.createElement('a');
    link.id='incrovax-assistant-download';
    link.href='downloads/INCrovax-Support-Assistant.exe';
    link.download='INCrovax-Support-Assistant.exe';
    link.textContent='INCrovax Support Assistant für Windows (.exe)';
    link.title='Symbol neben der Uhr; verwendet den bereits installierten INCrovax Support Agent';
    old.after(link);
  }
  function start() {
    paint(document.body);
    assistantLink();
    document.title = brand(document.title);
    new MutationObserver(records => {
      assistantLink();
      for (const record of records) {
        if (record.type === 'characterData') paint(record.target);
        else if (record.type === 'attributes') paint(record.target);
        else for (const node of record.addedNodes) paint(node);
      }
    }).observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['title','alt']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
