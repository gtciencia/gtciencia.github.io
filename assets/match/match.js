/* match.js — directorio + filtros + “matching” básico (cliente)
   Requisitos: PapaParse (CSV) + List.js (search/sort/filter).
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
  };

  if (els.formLink && FORM_URL) els.formLink.href = FORM_URL;

  if (!CSV_URL || CSV_URL.startsWith('PEGA_AQUI')) {
    renderFatal(
      'Falta configurar la URL del CSV.',
      'Edita _pages/match.md y pega la URL pública del CSV (Google Sheets → Archivo → Publicar en la web → CSV).'
    );
    return;
  }

  const state = {
    data: [],
    byId: new Map(),
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
    // Separadores típicos: coma, punto y coma, barra, salto de línea
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

  function pick(row, candidates) {
    for (const key of candidates) {
      if (key in row && String(row[key] ?? '').trim() !== '') return row[key];
    }
    return '';
  }

  function hasIntersection(arr, set) {
    if (set.size === 0) return true;
    for (const a of arr) if (set.has(a)) return true;
    return false;
  }

  function jaccard(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    if (A.size === 0 && B.size === 0) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter += 1;
    const union = A.size + B.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  function commonTags(a, b, max = 8) {
    const A = new Set(a);
    const out = [];
    for (const x of b) if (A.has(x)) out.push(x);
    return out.slice(0, max);
  }

  function fmtScore(x) {
    return (Math.round(x * 100) / 100).toFixed(2);
  }

  // ---------- Carga y render ----------

  async function loadCsvObjects(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo descargar el CSV (${res.status})`);
    const text = await res.text();

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || '').trim(),
    });

    if (parsed.errors?.length) {
      // PapaParse devuelve warnings/errores; no abortamos salvo que sea crítico
      console.warn('PapaParse errors:', parsed.errors);
    }

    return parsed.data || [];
  }

  function toItem(row, idx) {
    // Mapeo flexible de columnas (ajusta si tu Form usa otros nombres)
    const type = normalizeType(pick(row, ['Tipo', 'Eres...', 'TYPE', 'Entidad', 'Entity']));
    const name = String(pick(row, ['Nombre de la entidad', 'Name', 'Organización', 'Organizacion', 'Entidad', 'TITLE', 'Title'])).trim();
    const summaryLong = String(pick(row, [
      'Resumen corto de actividades (máx. 1200 caracteres)',
      'Resumen corto de actividades (máx. 1200 caracteres).',
      'Resumen corto de actividades',
      'Resumen'
    ])).trim();

    const tematica = splitTags(pick(row, [
      'Keywords temática', 'Keywords tematica', 'Temática', 'Tematica', 'THEMATIC', 'TAGS', 'Tags'
    ]));

    const convo = splitTags(pick(row, [
      'Keywords convocatoria', 'Convocatorias', 'Calls', 'CALLS', 'Funding', 'Programas'
    ]));

    const pdf = safeUrl(String(pick(row, ['PDF', 'Pdf', 'PDF link', 'Material PDF', 'Brochure', 'BROCHURE'])).trim());
    const web = safeUrl(String(pick(row, ['Web', 'Website', 'URL', 'Url'])).trim());
    const videos = extractUrls(pick(row, ['Vídeos', 'Videos', 'Video', 'YouTube', 'Vimeo'])).map(safeUrl).filter(Boolean);
    const links = extractUrls(pick(row, ['Enlaces', 'Links', 'Material', 'MATERIAL'])).map(safeUrl).filter(Boolean);

    const idRaw = pick(row, ['ID', 'Id', 'id', 'Timestamp', 'Marca temporal', 'Marca temporal (timestamp)']);
    const id = String(idRaw || '').trim() || `row-${idx}`;

    return {
      id,
      type: (type === 'unknown' ? 'grupo' : type), // valor por defecto si el form no lo recoge
      name,
      summaryLong,
      tematica,
      convo,
      pdf,
      web,
      videos,
      links,
      _raw: row,
    };
  }

  function renderCards(items, container, type) {
    container.innerHTML = '';

    for (const it of items) {
      const li = document.createElement('li');
      li.className = `card card--${it.type}`; // <-- para colores
      li.dataset.type = it.type;
      li.dataset.tematica = it.tematica.join('|');
      li.dataset.convo = it.convo.join('|');
      li.dataset.id = it.id;

      const header = document.createElement('div');
      header.className = 'card-header';

      const h = document.createElement('h3');
      h.className = 'name';

      // enlace a detalle
      const a = document.createElement('a');
      a.href = DETAIL_URL ? `${DETAIL_URL}?id=${encodeURIComponent(it.id)}` : '#';
      a.textContent = it.name || '(sin nombre)';
      a.className = 'detail-link';
      h.appendChild(a);

      const badge = document.createElement('span');
      badge.className = `badge badge--${it.type}`;
      badge.textContent = it.type === 'empresa' ? 'Empresa' : 'Grupo';

      header.appendChild(h);
      header.appendChild(badge);

      const p = document.createElement('p');
      p.className = 'summary';
      p.textContent = truncate(it.summaryLong || it.summary || '', 260);

      // hidden fields para búsqueda
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
      li.appendChild(hiddenTem);
      li.appendChild(hiddenCon);

      container.appendChild(li);
    }
  }


  function linkEl(label, href) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
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

    // sincroniza checkbox UI (cuando activas desde un tag del card)
    syncFacetCheckbox(which, tag, checked);

    applyFilters();
  }

  function syncFacetCheckbox(which, tag, checked) {
    const facetContainer = (which === 'tematica') ? els.facetTem : els.facetCon;
    const inputs = facetContainer.querySelectorAll('input[type="checkbox"]');
    for (const input of inputs) {
      if (input.value === tag) {
        input.checked = checked;
        break;
      }
    }
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

  function truncate(s, max = 260) {
    const t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }


  // ---------- Init ----------

  async function init() {
    try {
      const rows = await loadCsvObjects(CSV_URL);

      window.__MATCH_CSV__ = CSV_URL;

      const items = rows
        .map((r, i) => toItem(r, i))
        .filter((x) => x.name || x.summaryLong || x.summary);

      const grupos = items.filter(x => x.type === 'grupo');
      const empresas = items.filter(x => x.type === 'empresa');

      renderCards(grupos, els.cardsGrupos);
      renderCards(empresas, els.cardsEmpresas);

      buildFacets(items);

      state.lists.grupos = new List('col-grupos', { valueNames: ['name', 'summary', 'keywords_tematica', 'keywords_convo'] });
      state.lists.empresas = new List('col-empresas', { valueNames: ['name', 'summary', 'keywords_tematica', 'keywords_convo'] });

      state.lists.grupos.on('updated', updateCountAndEmpty);
      state.lists.empresas.on('updated', updateCountAndEmpty);
      updateCountAndEmpty();

      const q = document.getElementById('q');
      if (q) {
        q.addEventListener('input', () => {
          state.lists.grupos.search(q.value);
          state.lists.empresas.search(q.value);
          applyFilters();
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
