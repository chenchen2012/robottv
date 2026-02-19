(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const current = (window.location.pathname || '/').replace(/\/+$/, '') || '/';

  const normalize = (href) => {
    if (!href) return '';
    if (href.startsWith('http')) {
      try {
        const u = new URL(href);
        return (u.pathname || '/').replace(/\/+$/, '') || '/';
      } catch {
        return '';
      }
    }
    return href.replace(/\/+$/, '') || '/';
  };

  const byPath = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/home': 'home.html',
    '/home.html': 'home.html',
    '/companies': 'companies.html',
    '/companies.html': 'companies.html',
    '/live': 'live.html',
    '/live.html': 'live.html',
    '/about': 'about.html',
    '/about.html': 'about.html',
    '/news': 'https://news.robot.tv',
    '/news.html': 'https://news.robot.tv'
  };

  const robotDetailSlugs = new Set([
    '/anymal', '/apollo', '/asimo', '/atlas', '/digit', '/handle', '/spot', '/thr3', '/unitreeg1', '/yumi',
    '/anymal.html', '/apollo.html', '/asimo.html', '/atlas.html', '/digit.html', '/handle.html', '/spot.html', '/thr3.html', '/unitreeg1.html', '/yumi.html'
  ]);

  let targetHref = byPath[current] || '';
  if (!targetHref && current.startsWith('/company-')) targetHref = 'companies.html';
  if (!targetHref && robotDetailSlugs.has(current)) targetHref = 'home.html';

  nav.querySelectorAll('a').forEach((a) => {
    const path = normalize(a.getAttribute('href') || '');
    const isNewsLink = (a.getAttribute('href') || '').includes('news.robot.tv');
    const onNewsDomain = window.location.hostname === 'news.robot.tv';

    let active = false;
    if (onNewsDomain && isNewsLink) active = true;
    else if (targetHref) {
      const targetPath = normalize(targetHref);
      active = path === targetPath;
    }

    if (active) a.classList.add('is-active');
  });
})();
