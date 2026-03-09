(function () {
  if (document.querySelector('.related-news-panel[data-static-related-news="true"]')) return;

  const route = (window.location.pathname || '/').replace(/^\/+/, '').replace(/\/+$/, '') || 'index.html';
  const pageKey = route.replace(/\.html$/i, '').toLowerCase();

  const keywordMap = {
    'company-agility': ['agility', 'digit', 'warehouse', 'logistics'],
    'company-apptronik': ['apptronik', 'apollo', 'humanoid'],
    'handle': ['handle', 'boston dynamics', 'warehouse'],
    'anymal': ['anymal', 'quadruped', 'inspection'],
    'digit': ['digit', 'agility', 'logistics', 'warehouse'],
    'apollo': ['apollo', 'apptronik', 'humanoid'],
    'asimo': ['asimo', 'honda', 'humanoid'],
    'thr3': ['thr3', 'toyota', 'humanoid'],
    'yumi': ['yumi', 'abb', 'industrial']
  };

  const keywords = keywordMap[pageKey];
  if (!Array.isArray(keywords) || !keywords.length) return;

  const toText = (s) => String(s || '').toLowerCase();
  const score = (post) => {
    const hay = toText([post.title, post.excerpt, ...(post.cats || [])].join(' '));
    return keywords.reduce((sum, k) => sum + (hay.includes(toText(k)) ? 1 : 0), 0);
  };

  const query = '*[_type=="post"] | order(publishedAt desc)[0...200]{title,excerpt,publishedAt,youtubeUrl,"slug":slug.current,"cats":categories[]->title}';
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

      const picks = [];
      const seen = new Set();
      for (const entry of ranked) {
        if (entry.s <= 0 || seen.has(entry.p.slug)) continue;
        seen.add(entry.p.slug);
        picks.push(entry.p);
        if (picks.length >= 3) break;
      }
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
              <a href="https://news.robot.tv/${p.slug}/">
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
