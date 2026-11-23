// Tador Leads — install to home screen (Android prompt / iOS instructions) + auto-update
(() => {
  const btn = document.getElementById('installBtn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/crm/sw.js', { scope: '/crm/' }).then(reg => {
      reg.update();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;   // not on first install
      reloaded = true; location.reload();
    });
  }

  if (standalone) return;   // already installed → no button

  // Android / Chrome / Edge: real install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e; btn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); deferred = null; });

  // iPhone: no prompt exists → show the button with instructions
  if (isIOS) btn.classList.remove('hidden');

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') btn.classList.add('hidden');
      return;
    }
    window.TadorLeads.modal(`<h3>הוספה למסך הבית</h3><p class="sub">כך האפליקציה תיפתח כמו אפליקציה רגילה</p>
      <div class="ios-steps">
        ${isIOS
          ? `<div><b>1</b> לחץ על כפתור השיתוף <span style="font-size:18px">⬆︎</span> בתחתית Safari</div>
             <div><b>2</b> גלול ובחר "הוסף למסך הבית"</div>
             <div><b>3</b> לחץ "הוסף" — האייקון יופיע במסך הבית</div>`
          : `<div><b>1</b> פתח את תפריט הדפדפן ⋮</div>
             <div><b>2</b> בחר "התקן אפליקציה" / "הוסף למסך הבית"</div>`}
      </div>`);
  });
})();
