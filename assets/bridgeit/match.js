/* bridgeit/match.js — directorio + filtros (cliente)
   Lee un CSV público (Google Sheets publicado) y construye un directorio “Bridge it!”.
   Dependencias: PapaParse (CSV) + List.js (search/sort/filter).

   Novedades:
   - Soporte de "Elevator pitch" (campo corto para la tarjeta)
   - Soporte de "Convocatorias de interés" (tags/faceta)
   - Soporte de "Página Bridge it (opcional)" -> si existe, enlaza a esa página; si no, a la ficha generada.
   - Soporte de "Logo/Imagen (URL)" (opcional)
*/
(() => {
  'use strict';

  const root = document.getElementById('matchapp');
  if (!root) return;

  const CSV_URL = (root.dataset.csvUrl || '').trim();
  const FORM_URL = (root.dataset.formUrl || '').trim();
  const DETAIL_URL = (root.dataset.detailUrl || '').trim();

  const els = {
    formLink: document.getElementById('formLink'),
    cardsGrupos: document.getElementById('cards-grupos'),
    cardsEmpresas: document.getElementById('cards-empresas'),
    count: document.getElementById('count'),
    countGrupos: document.getElementById('count-grupos'),
    countEmpresas: document.getElementById('count-empresas'),
    empty: document.getElementById('emptyState'),
    facetTem: document.getElementById('facet-tematica'),
    facetCon: document.getElementById('facet-convo'),
    clear: document.getElementById('clearFilters'),
    sortBtn: root.querySelector('button.sort[data-sort="name"]'),
  };

  if (els.formLink && FORM_URL) els.formLink.href = FORM_URL;

  if (!CSV_URL || CSV_URL.startsWith('PEGA_AQUI')) {
    renderFatal(
      'Falta configurar la URL del CSV.',
      'Edita la página y pega la URL pública del CSV (Google Sheets → Archivo → Publicar en la web → CSV).'
    );
    return;
  }

  const state = {
    lists: { grupos: null, empresas: null },
    filters: {
      tematica: new Set(),
      convo: new Set(),
    },
  };

  // ---------- Utilidades ----------

  function renderFatal(title, details) {
    const box = document.createElement('div');
    box.className = 'empty';
    box.innerHTML = `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(details)}</p>`;
    root.querySelector('.results')?.prepend(box);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeType(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    if (!s) return 'unknown';
    if (s.startsWith('emp')) return 'empresa';
    if (s.startsWith('gru')) return 'grupo';
    if (s.includes('research')) return 'grupo';
    if (s.includes('company')) return 'empresa';
    return s;
  }

  function normalizeTag(raw) {
    return String(raw ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(/\s+/g, ' ')
      .replaceAll(/[·•]/g, ' ')
      .trim();
  }

  function splitTags(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return [];
    return s
      .split(/[,;\n|]+/g)
      .map(normalizeTag)
      .filter(Boolean)
      .filter((t, idx, arr) => arr.indexOf(t) === idx);
  }

  function extractUrls(raw) {
    const s = String(raw ?? '');
    const re = /(https?:\/\/[^\s,;]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(s)) !== null) out.push(m[1]);
    return out.filter((u, idx, arr) => arr.indexOf(u) === idx);
  }

  function safeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
      return null;
    } catch {
      return null;
    }
  }

  // Acepta URLs absolutas http(s) o rutas internas "/...".
  function safeHref(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const abs = safeUrl(s);
    if (abs) return abs;

    // Rutas internas (recomendado: /bridgeit/...)
    if (s.startsWith('/') && !s.startsWith('//')) return s;

    return null;
  }

  function isExternalHref(href) {
    return /^https?:\/\//i.test(String(href || ''));
  }

  function pick(row, candidates) {
    for (const key of candidates) {
      if (key in row && String(row[key] ?? '').trim() !== '') return row[key];
    }
    return '';
  }

  // Selecciona una columna por patrón del nombre (útil cuando cambias el texto de la pregunta del Form).
  function pickByRegex(row, regexes) {
    const keys = Object.keys(row || {});
    for (const re of regexes) {
      const key = keys.find(k => re.test(k));
      if (key && String(row[key] ?? '').trim() !== '') return row[key];
    }
    return '';
  }

  function pickSmart(row, candidates, regexes) {
    return pick(row, candidates) || pickByRegex(row, regexes);
  }

  function hasIntersection(arr, set) {
    if (set.size === 0) return true;
    for (const a of arr) if (set.has(a)) return true;
    return false;
  }

  function truncate(s, max = 260) {
    const t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  // ---------- Carga CSV ----------

  async function loadCsvObjects(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo descargar el CSV (${res.status})`);
    const text = await res.text();

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || '').trim(),
    });

    if (parsed.errors?.length) console.warn('PapaParse errors:', parsed.errors);
    return parsed.data || [];
  }

  // ---------- Modelo ----------

  function toItem(row, idx) {
    const type = normalizeType(pickSmart(
      row,
      ['Tipo', 'Eres...', 'TYPE', 'Entidad', 'Entity', 'Tipo de entidad', 'Tipo de organización', 'Tipo de organizacion'],
      [/^tipo/i, /eres/i, /entity/i]
    ));

    const name = String(pickSmart(
      row,
      ['Nombre de la entidad', 'Nombre', 'Name', 'Organización', 'Organizacion', 'Entidad', 'TITLE', 'Title'],
      [/^nombre/i, /organiza/i, /entidad/i, /name/i, /title/i]
    )).trim();

    // Nuevo: Elevator pitch (campo corto para la tarjeta)
    const pitch = String(pickSmart(
      row,
      [
        'Elevator pitch',
        'Elevator Pitch',
        'Pitch',
        'Elevator pitch (máx. 280 caracteres)',
        'Elevator pitch (max. 280 caracteres)',
        'Elevator pitch (máx. 300 caracteres)',
        'Propuesta de valor',
        'Propuesta de valor (1-2 frases)',
        'Mensaje corto',
        'Resumen en 1 frase',
      ],
      [/elevator/i, /\bpitch\b/i, /propuesta.*valor/i, /mensaje.*corto/i, /1\s*frase/i]
    )).trim();

    // Resumen largo (hasta 1200) para la ficha
    const summaryLong = String(pickSmart(
      row,
      [
        'Resumen corto de actividades (máx. 1200 caracteres)',
        'Resumen corto de actividades (máx. 1200 caracteres).',
        'Resumen corto de actividades',
        'Resumen',
        'Descripción',
        'Descripcion',
      ],
      [/resumen/i, /descrip/i]
    )).trim();

    // Capacidades / temática
    const tematica = splitTags(pickSmart(
      row,
      ['Keywords temática', 'Keywords tematica', 'Temática', 'Tematica', 'THEMATIC', 'TAGS', 'Tags', 'Capacidades', 'Capacidades técnicas', 'Capacidades tecnicas'],
      [/temat/i, /capacidad/i, /keyword.*tema/i, /\btags?\b/i]
    ));

    // Convocatorias de interés (para participar)
    const convo = splitTags(pickSmart(
      row,
      [
        'Keywords convocatorias',
        'Keywords convocatoria',
        'Convocatorias',
        'Convocatorias de interés',
        'Convocatorias de interes',
        'Convocatorias objetivo',
        'Convocatorias a las que concurrir',
        'Convocatorias a las que quiere concurrir',
        'Convocatorias a las que queréis concurrir',
        'Calls',
        'CALLS',
        'Funding',
        'Programas',
        'Programas objetivo',
      ],
      [/convoc/i, /\bcalls?\b/i, /program/i, /funding/i]
    ));

    // Opcional: URL/página ampliada (Markdown en el sitio o URL externa)
    const profileUrl = safeHref(pickSmart(
      row,
      [
        'Página Bridge it',
        'Pagina Bridge it',
        'Página Bridge it (opcional)',
        'Pagina Bridge it (opcional)',
        'Página (opcional)',
        'Pagina (opcional)',
        'Página',
        'Pagina',
        'Perfil',
        'Profile',
        'URL página',
        'URL pagina',
        'URL perfil',
        'Profile URL',
      ],
      [/p(á|a)gina/i, /perfil/i, /\bprofile\b/i, /url.*(p(á|a)gina|perfil)/i]
    ));

    // Opcional: imagen/logo (URL)
    const logo = safeHref(pickSmart(
      row,
      [
        'Logo (URL)',
        'Logo',
        'Imagen (URL)',
        'Imagen',
        'Image URL',
        'Logo / Imagen (URL)',
        'URL logo',
        'URL imagen',
      ],
      [/logo/i, /imagen/i, /\bimage\b/i]
    ));

    const pdf = safeUrl(String(pickSmart(
      row,
      ['PDF', 'Pdf', 'PDF link', 'Material PDF', 'Enlace PDF', 'Brochure', 'BROCHURE'],
      [/\bpdf\b/i]
    )).trim());

    const web = safeUrl(String(pickSmart(
      row,
      ['Web', 'Website', 'URL', 'Url', 'Página web', 'Pagina web', 'Site'],
      [/web/i, /website/i, /p(á|a)gina web/i]
    )).trim());

    const videos = extractUrls(pickSmart(
      row,
      ['Vídeos', 'Videos', 'Video', 'YouTube', 'Vimeo'],
      [/video/i, /youtube/i, /vimeo/i]
    )).map(safeUrl).filter(Boolean);

    const links = extractUrls(pickSmart(
      row,
      ['Enlaces', 'Links', 'Material', 'MATERIAL', 'Otros enlaces', 'Otros links'],
      [/enlaces?/i, /\blinks?\b/i, /material/i]
    )).map(safeUrl).filter(Boolean);

    const idRaw = pickSmart(
      row,
      ['ID', 'Id', 'id', 'Timestamp', 'Marca temporal', 'Marca temporal (timestamp)'],
      [/timestamp/i, /marca temporal/i]
    );
    const id = String(idRaw || '').trim() || `row-${idx}`;

    return {
      id,
      type: (type === 'unknown' ? 'grupo' : type),
      name,
      pitch,
      summaryLong,
      tematica,
      convo,
      profileUrl,
      logo,
      pdf,
      web,
      videos,
      links,
    };
  }

  function makePrimaryHref(it) {
    const custom = it.profileUrl;
    if (custom) return { href: custom, external: isExternalHref(custom), kind: 'custom' };

    if (!DETAIL_URL) return { href: '#', external: false, kind: 'none' };

    // Pasamos también el CSV para que /bridgeit/item/ funcione aunque se abra “directo”
    const href = `${DETAIL_URL}?id=${encodeURIComponent(it.id)}&csv=${encodeURIComponent(CSV_URL)}`;
    return { href, external: false, kind: 'detail' };
  }

  // ---------- Render ----------

  function renderCards(items, container) {
    container.innerHTML = '';

    for (const it of items) {
      const li = document.createElement('li');
      li.className = `card card--${it.type}`;
      li.dataset.type = it.type;
      li.dataset.tematica = it.tematica.join('|');
      li.dataset.convo = it.convo.join('|');
      li.dataset.id = it.id;

      const header = document.createElement('div');
      header.className = 'card-header';

      const headLeft = document.createElement('div');
      headLeft.className = 'card-headleft';

      if (it.logo) {
        const img = document.createElement('img');
        img.className = 'card-logo';
        img.src = it.logo;
        img.alt = '';
        img.loading = 'lazy';
        headLeft.appendChild(img);
      }

      const h = document.createElement('h3');
      h.className = 'name';

      const primary = makePrimaryHref(it);
      const a = document.createElement('a');
      a.href = primary.href;
      a.textContent = it.name || '(sin nombre)';
      a.className = 'detail-link';

      if (primary.external) {
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = 'Abrir en otra pestaña';
      }

      h.appendChild(a);
      headLeft.appendChild(h);

      const pill = document.createElement('span');
      pill.className = `type-pill type-pill--${it.type}`;
      pill.textContent = it.type === 'empresa' ? 'Empresa' : 'Grupo';

      header.appendChild(headLeft);
      header.appendChild(pill);

      // Texto visible: pitch (si existe) o resumen truncado
      const p = document.createElement('p');
      p.className = 'summary';
      const visibleText = it.pitch || it.summaryLong || '';
      p.textContent = truncate(visibleText, it.pitch ? 240 : 260);
      if (it.pitch) p.classList.add('summary--pitch');

      // Chips (capacidad/temática + convocatorias)
      const chips = document.createElement('div');
      chips.className = 'chips';

      const temMax = 2;
      const conMax = 3;

      for (const t of it.tematica.slice(0, temMax)) {
        const s = document.createElement('span');
        s.className = 'tag tag--tem';
        s.textContent = t;
        chips.appendChild(s);
      }

      for (const c of it.convo.slice(0, conMax)) {
        const s = document.createElement('span');
        s.className = 'tag tag--convo';
        s.textContent = c;
        chips.appendChild(s);
      }

      // Campos ocultos para List.js (búsqueda)
      const hiddenPitch = document.createElement('span');
      hiddenPitch.className = 'pitch';
      hiddenPitch.hidden = true;
      hiddenPitch.textContent = it.pitch || '';

      const hiddenSummary = document.createElement('span');
      hiddenSummary.className = 'full_summary';
      hiddenSummary.hidden = true;
      hiddenSummary.textContent = it.summaryLong || '';

      const hiddenTem = document.createElement('span');
      hiddenTem.className = 'keywords_tematica';
      hiddenTem.hidden = true;
      hiddenTem.textContent = it.tematica.join(' ');

      const hiddenCon = document.createElement('span');
      hiddenCon.className = 'keywords_convo';
      hiddenCon.hidden = true;
      hiddenCon.textContent = it.convo.join(' ');

      li.appendChild(header);
      li.appendChild(p);
      if (chips.childElementCount) li.appendChild(chips);
      li.appendChild(hiddenPitch);
      li.appendChild(hiddenSummary);
      li.appendChild(hiddenTem);
      li.appendChild(hiddenCon);

      container.appendChild(li);
    }
  }

  function buildFacets(items) {
    const temCounts = new Map();
    const conCounts = new Map();

    for (const it of items) {
      for (const t of it.tematica) temCounts.set(t, (temCounts.get(t) || 0) + 1);
      for (const c of it.convo) conCounts.set(c, (conCounts.get(c) || 0) + 1);
    }

    const temSorted = [...temCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const conSorted = [...conCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    renderFacetGroup(els.facetTem, 'tematica', temSorted);
    renderFacetGroup(els.facetCon, 'convo', conSorted);
  }

  function renderFacetGroup(container, facetName, entries) {
    container.innerHTML = '';

    if (!entries.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = '—';
      container.appendChild(p);
      return;
    }

    const maxVisible = 25;
    entries.forEach(([tag, count], idx) => {
      const row = document.createElement('div');
      row.className = 'facet-item';
      if (idx >= maxVisible) row.hidden = true;

      const label = document.createElement('label');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = tag;
      input.addEventListener('change', () => toggleFacet(facetName, tag, input.checked));

      const span = document.createElement('span');
      span.textContent = tag;

      const countEl = document.createElement('span');
      countEl.className = 'count';
      countEl.textContent = String(count);

      label.appendChild(input);
      label.appendChild(span);

      row.appendChild(label);
      row.appendChild(countEl);
      container.appendChild(row);
    });

    if (entries.length > maxVisible) {
      const more = document.createElement('button');
      more.type = 'button';
      more.textContent = 'Mostrar todas';
      more.addEventListener('click', () => {
        const hiddenRows = container.querySelectorAll('.facet-item[hidden]');
        hiddenRows.forEach((r) => { r.hidden = false; });
        more.remove();
      });
      container.appendChild(more);
    }
  }

  // ---------- Filtros ----------

  function toggleFacet(which, tag, checked) {
    const set = state.filters[which];
    if (!(set instanceof Set)) return;

    if (checked) set.add(tag);
    else set.delete(tag);

    applyFilters();
  }

  function applyFilters() {
    const f = state.filters;

    const predicate = (item) => {
      const el = item.elm;
      const tem = (el.dataset.tematica || '').split('|').filter(Boolean);
      const con = (el.dataset.convo || '').split('|').filter(Boolean);

      if (!hasIntersection(tem, f.tematica)) return false;
      if (!hasIntersection(con, f.convo)) return false;
      return true;
    };

    state.lists.grupos?.filter(predicate);
    state.lists.empresas?.filter(predicate);

    updateCountAndEmpty();
  }

  function clearFilters() {
    state.filters.tematica.clear();
    state.filters.convo.clear();

    root.querySelectorAll('.facet input[type="checkbox"]').forEach((cb) => { cb.checked = false; });

    const q = document.getElementById('q');
    if (q) q.value = '';

    state.lists.grupos?.search('');
    state.lists.empresas?.search('');
    state.lists.grupos?.filter();
    state.lists.empresas?.filter();

    updateCountAndEmpty();
  }

  function updateCountAndEmpty() {
    const ng = state.lists.grupos?.matchingItems?.length ?? 0;
    const ne = state.lists.empresas?.matchingItems?.length ?? 0;
    const n = ng + ne;

    els.count.textContent = String(n);
    els.countGrupos.textContent = String(ng);
    els.countEmpresas.textContent = String(ne);
    els.empty.hidden = n !== 0;
  }

  // ---------- Init ----------

  async function init() {
    try {
      const rows = await loadCsvObjects(CSV_URL);

      // Para que la ficha pueda reutilizarlo como fallback
      window.__MATCH_CSV__ = CSV_URL;

      const items = rows
        .map((r, i) => toItem(r, i))
        // evita filas vacías
        .filter((x) => x.name || x.pitch || x.summaryLong);

      const grupos = items.filter(x => x.type === 'grupo');
      const empresas = items.filter(x => x.type === 'empresa');

      renderCards(grupos, els.cardsGrupos);
      renderCards(empresas, els.cardsEmpresas);

      buildFacets(items);

      // Incluimos campos extra en búsqueda (pitch + resumen completo)
      const valueNames = ['name', 'summary', 'pitch', 'full_summary', 'keywords_tematica', 'keywords_convo'];

      state.lists.grupos = new List('col-grupos', { valueNames });
      state.lists.empresas = new List('col-empresas', { valueNames });

      state.lists.grupos.on('updated', updateCountAndEmpty);
      state.lists.empresas.on('updated', updateCountAndEmpty);
      updateCountAndEmpty();

      // Búsqueda global para ambas listas
      const q = document.getElementById('q');
      if (q) {
        q.addEventListener('input', () => {
          state.lists.grupos.search(q.value);
          state.lists.empresas.search(q.value);
          applyFilters();
        });
      }

      // Ordenar A-Z / Z-A
      if (els.sortBtn) {
        let asc = true;
        els.sortBtn.addEventListener('click', () => {
          const order = asc ? 'asc' : 'desc';
          state.lists.grupos?.sort('name', { order });
          state.lists.empresas?.sort('name', { order });

          els.sortBtn.textContent = asc ? 'Ordenar Z→A' : 'Ordenar A→Z';
          asc = !asc;
        });
      }

      if (els.clear) els.clear.addEventListener('click', clearFilters);

    } catch (err) {
      console.error(err);
      renderFatal('Error cargando el directorio', String(err?.message || err));
    }
  }

  init();
})();
