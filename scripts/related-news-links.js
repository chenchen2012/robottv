(function () {
  const route = (window.location.pathname || '/').replace(/^\/+/, '').replace(/\/+$/, '') || 'index.html';
  const pageKey = route.replace(/\.html$/i, '').toLowerCase();

  const keywordMap = {
    'companies': ['unitree', 'tesla', 'figure', 'boston dynamics', 'agility', 'apptronik', 'humanoid'],
    'company-unitree': ['unitree', 'humanoid', 'quadruped'],
    'company-boston-dynamics': ['boston dynamics', 'atlas', 'spot', 'stretch'],
    'company-tesla': ['tesla', 'optimus', 'humanoid'],
    'company-figure': ['figure', 'figure ai', 'humanoid'],
    'company-agility': ['agility', 'digit', 'warehouse', 'logistics'],
    'company-apptronik': ['apptronik', 'apollo', 'humanoid'],
    'atlas': ['atlas', 'boston dynamics', 'humanoid'],
    'spot': ['spot', 'boston dynamics', 'quadruped'],
    'handle': ['handle', 'boston dynamics', 'warehouse'],
    'anymal': ['anymal', 'quadruped', 'inspection'],
    'digit': ['digit', 'agility', 'logistics', 'warehouse'],
    'apollo': ['apollo', 'apptronik', 'humanoid'],
    'asimo': ['asimo', 'honda', 'humanoid'],
    'thr3': ['thr3', 'toyota', 'humanoid'],
    'unitreeg1': ['unitree', 'g1', 'humanoid'],
    'yumi': ['yumi', 'abb', 'industrial']
  };

  const keywords = keywordMap[pageKey];
  if (!Array.isArray(keywords) || !keywords.length) return;

  const toText = (s) => String(s || '').toLowerCase();
  const score = (post) => {
    const hay = toText([post.title, post.excerpt, ...(post.cats || [])].join(' '));
    return keywords.reduce((sum, k) => sum + (hay.includes(toText(k)) ? 1 : 0), 0);
  };

  const query = '*[_type=="post"] | order(publishedAt desc)[0...24]{title,excerpt,publishedAt,youtubeUrl,"slug":slug.current,"cats":categories[]->title}';
  const endpoint = `https://lumv116w.api.sanity.io/v2023-10-01/data/query/production?query=${encodeURIComponent(query)}`;

  fetch(endpoint)
    .then((r) => r.json())
    .then((d) => {
      const posts = Array.isArray(d?.result) ? d.result : [];
      if (!posts.length) return;

      const ranked = posts
        .map((p) => ({ p, s: score(p) }))
        .filter((x) => x.p.slug)
        .sort((a, b) => b.s - a.s || String(b.p.publishedAt).localeCompare(String(a.p.publishedAt)));

      const picks = ranked.filter((x) => x.s > 0).slice(0, 3).map((x) => x.p);
      if (!picks.length) return;

      const footer = document.querySelector('.site-footer');
      const mount = document.createElement('section');
      mount.className = 'panel related-news-panel';
      mount.innerHTML = `
        <p class="kicker">RELATED COVERAGE</p>
        <h2>Latest Intelligence For This Profile</h2>
        <ul class="related-news-list">
          ${picks.map((p) => `
            <li class="related-news-item">
              <a href="https://news.robot.tv/post/${p.slug}">
                <h3>${String(p.title || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))}</h3>
                <p>${new Date(p.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
              </a>
            </li>
          `).join('')}
        </ul>
      `;

      if (footer && footer.parentNode) {
        footer.parentNode.insertBefore(mount, footer);
      }
    })
    .catch(() => {});
})();
