(function () {
  var page = window.location.pathname.split('/').pop() || 'index.html';

  /* ── Overlay ── */
  var ov = document.createElement('div');
  ov.id = 'nav-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:oklch(96.5% 0.005 68);display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.4s ease;';

  function isActive(p) { return page === p ? 'pointer-events:none;filter:opacity(0.2);' : ''; }
  var itemStyle = 'display:block;text-decoration:none;width:clamp(140px,22vw,270px);opacity:0;transform:translateY(28px);transition:opacity 0.5s ease,transform 0.5s ease,filter 0.2s;';
  var imgStyle  = 'width:100%;height:auto;display:block;mix-blend-mode:multiply;';

  ov.innerHTML =
    '<button id="nv-close" style="position:absolute;top:28px;right:48px;background:none;border:none;cursor:pointer;font-size:22px;color:oklch(50% 0.003 60);line-height:1;padding:4px;">✕</button>' +
    '<nav style="display:flex;align-items:center;gap:36px;padding:0 48px;justify-content:center;width:100%;max-width:960px;">' +
      '<a href="about.html"    style="' + itemStyle + isActive('about.html')    + '"><img src="img/IMG_9657.PNG" alt="About"    style="' + imgStyle + '"></a>' +
      '<a href="projects.html" style="' + itemStyle + isActive('projects.html') + '"><img src="img/IMG_9658.PNG" alt="Projects" style="' + imgStyle + '"></a>' +
      '<a href="contact.html"  style="' + itemStyle + isActive('contact.html')  + '"><img src="img/IMG_9659.PNG" alt="Contact"  style="' + imgStyle + '"></a>' +
    '</nav>' +
    '<a href="index.html" style="position:absolute;bottom:28px;left:48px;font-size:10px;letter-spacing:.10em;text-transform:uppercase;color:oklch(60% 0.003 60);text-decoration:none;">← Главная</a>';

  document.body.appendChild(ov);

  var items = ov.querySelectorAll('nav a');

  /* ── Burger ── */
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Меню');
  btn.style.cssText = 'background:none;border:none;cursor:pointer;pointer-events:all;z-index:10000;position:relative;display:flex;flex-direction:column;gap:5px;padding:6px;align-items:flex-end;';
  btn.innerHTML =
    '<span style="display:block;width:24px;height:2px;background:currentColor;border-radius:0;transition:transform .3s ease;"></span>' +
    '<span style="display:block;width:14px;height:2px;background:currentColor;border-radius:0;transition:transform .3s ease,width .3s ease;"></span>';

  var header = document.querySelector('.site-header');
  if (header) {
    var oldNav = header.querySelector('.site-nav');
    if (oldNav) oldNav.style.display = 'none';
    header.style.pointerEvents = 'all';
    var isLight = header.classList.contains('site-header--light');
    btn.style.color = isLight ? 'oklch(7% 0.005 60)' : 'oklch(94% 0.004 60)';
    header.appendChild(btn);
  }

  var spans = btn.querySelectorAll('span');
  var isOpen = false;

  function open() {
    isOpen = true;
    ov.style.opacity = '1';
    ov.style.pointerEvents = 'all';
    document.body.style.overflow = 'hidden';
    spans[0].style.transform = 'translateY(3.5px) rotate(45deg)';
    spans[1].style.width = '24px';
    spans[1].style.transform = 'translateY(-3.5px) rotate(-45deg)';
    items.forEach(function (el, i) {
      setTimeout(function () {
        el.style.opacity = '1';
        el.style.transform = 'none';
      }, 80 + i * 80);
    });
  }

  function close() {
    isOpen = false;
    ov.style.opacity = '0';
    ov.style.pointerEvents = 'none';
    document.body.style.overflow = '';
    spans[0].style.transform = '';
    spans[1].style.transform = '';
    spans[1].style.width = '14px';
    items.forEach(function (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
    });
  }

  btn.addEventListener('click', function () { isOpen ? close() : open(); });
  document.getElementById('nv-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* sync colour on scroll */
  window.addEventListener('scroll', function () {
    if (!header) return;
    btn.style.color = header.classList.contains('site-header--light')
      ? 'oklch(7% 0.005 60)'
      : 'oklch(94% 0.004 60)';
  }, { passive: true });
})();
