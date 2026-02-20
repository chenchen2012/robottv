(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  const current = (window.location.pathname || '/').replace(/\/+$/, '') || '/';

  const normalize = (href) => {
    if (!href) return '';
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return '';
    try {
      const u = new URL(href, window.location.origin);
      return (u.pathname || '/').replace(/\/+$/, '') || '/';
    } catch {
      return '';
    }
  };

  const canonical = (path) => {
    if (!path) return '';
    let p = path;
    if (p === '/index.html') return '/';
    if (p.endsWith('.html')) p = p.slice(0, -5);
    return p || '/';
  };

  const byPath = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/home': 'home.html',
    '/home.html': 'home.html',
    '/humanoid-robots': 'home.html',
    '/humanoid-robots.html': 'home.html',
    '/humanoids': 'home.html',
    '/companies': 'companies.html',
    '/companies.html': 'companies.html',
    '/robot-companies': 'companies.html',
    '/robot-companies.html': 'companies.html',
    '/companies-hub': 'companies.html',
    '/live': 'live.html',
    '/live.html': 'live.html',
    '/about': 'about.html',
    '/about.html': 'about.html',
    '/partner': 'partner.html',
    '/partner.html': 'partner.html',
    '/media-kit': 'partner.html',
    '/mediakit': 'partner.html',
    '/mediakit.html': 'partner.html',
    '/mediakit-print': 'partner.html',
    '/mediakit-print.html': 'partner.html',
    '/pricing': 'partner.html',
    '/pricing.html': 'partner.html',
    '/news': 'https://news.robot.tv',
    '/news.html': 'https://news.robot.tv'
  };

  const robotDetailSlugs = new Set([
    '/anymal', '/apollo', '/asimo', '/atlas', '/digit', '/handle', '/spot', '/stretch', '/thr3', '/unitreeg1', '/unitreeh1', '/unitreeh2', '/unitreego2', '/unitreeb2', '/yumi',
    '/anymal.html', '/apollo.html', '/asimo.html', '/atlas.html', '/digit.html', '/handle.html', '/spot.html', '/stretch.html', '/thr3.html', '/unitreeg1.html', '/unitreeh1.html', '/unitreeh2.html', '/unitreego2.html', '/unitreeb2.html', '/yumi.html'
  ]);

  let targetHref = byPath[current] || '';
  if (!targetHref && current.startsWith('/company-')) targetHref = 'companies.html';
  if (!targetHref && robotDetailSlugs.has(current)) targetHref = 'home.html';

  nav.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const path = normalize(href);
    const isNewsLink = href.includes('news.robot.tv');
    const onNewsDomain = window.location.hostname === 'news.robot.tv';
    const targetIsNews = String(targetHref).includes('news.robot.tv');

    let active = false;
    if (onNewsDomain && isNewsLink) active = true;
    else if (targetIsNews) active = isNewsLink;
    else if (targetHref) {
      const targetPath = normalize(targetHref);
      active = !isNewsLink && canonical(path) === canonical(targetPath);
    }

    if (active) a.classList.add('is-active');
  });
})();
