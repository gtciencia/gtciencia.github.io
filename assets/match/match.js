/* match.js — directorio + filtros + “matching” básico (cliente)
   Requisitos: PapaParse (CSV) + List.js (search/sort/filter).
*/
(() => {
  'use strict';

  const root = document.getElementById('matchapp');
  if (!root) return;

  const CSV_URL = (root.dataset.csvUrl || '').trim();
  const FORM_URL = (root.dataset.formUrl || '').trim();

  const els = {
    formLink: document.getElementById('formLink'),
    cards: document.getElementById('cards'),
    count: document.getElementById('count'),
    empty: document.getElementById('emptyState'),
    facetTem: document.getElementById('facet-tematica'),
    facetCon: document.getElementById('facet-convo'),
    clear: document.getElementById('clearFilters'),
    typeRadios: Array.from(document.querySelectorAll('input[name="type"]')),
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
    list: null,
    filters: {
      type: 'all',          // all|grupo|empresa
      tematica: new Set(),  // tags seleccionadas
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
    const type = normalizeType(pick(row, ['Tipo', 'type', 'TYPE', 'Entidad', 'Entity']));
    const name = String(pick(row, ['Nombre', 'Name', 'Organización', 'Organizacion', 'Entidad', 'TITLE', 'Title'])).trim();
    const summary = String(pick(row, ['Resumen', 'Descripción', 'Descripcion', 'Description', 'DESCRIPTION'])).trim();

    const tematica = splitTags(pick(row, [
      'Keywords temática', 'Keywords tematica', 'Temática', 'Tematica', 'THEMATIC', 'TAGS', 'Tags'
    ]));

    const convo = splitTags(pick(row, [
      'Keywords convocatorias', 'Convocatorias', 'Calls', 'CALLS', 'Funding', 'Programas'
    ]));

    const pdf = safeUrl(String(pick(row, ['PDF', 'Pdf', 'PDF link', 'Material PDF', 'Brochure', 'BROCHURE'])).trim());
    const web = safeUrl(String(pick(row, ['Web', 'Website', 'URL', 'Url'])).trim());
    const videos = extractUrls(pick(row, ['Vídeos', 'Videos', 'Video', 'YouTube', 'Vimeo'])).map(safeUrl).filter(Boolean);
    const links = extractUrls(pick(row, ['Enlaces', 'Links', 'Material', 'MATERIAL'])).map(safeUrl).filter(Boolean);

    const id = String(pick(row, ['ID', 'Id', 'id', 'Timestamp', 'Marca temporal', 'Marca temporal (timestamp)'])) || `row-${idx}`;

    return {
      id,
      type: (type === 'unknown' ? 'grupo' : type), // valor por defecto si el form no lo recoge
      name,
      summary,
      tematica,
      convo,
      pdf,
      web,
      videos,
      links,
      _raw: row,
    };
  }

  function renderCards(items) {
    els.cards.innerHTML = '';

    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'card';
      li.dataset.type = it.type;
      li.dataset.tematica = it.tematica.join('|');
      li.dataset.convo = it.convo.join('|');
      li.dataset.id = it.id;

      // Header
      const header = document.createElement('div');
      header.className = 'card-header';

      const h = document.createElement('h3');
      h.className = 'name';
      h.textContent = it.name || '(sin nombre)';

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = it.type === 'empresa' ? 'Empresa' : (it.type === 'grupo' ? 'Grupo' : it.type);

      header.appendChild(h);
      header.appendChild(badge);

      // Summary
      const p = document.createElement('p');
      p.className = 'summary';
      p.textContent = it.summary || '';

      // Tags
      const tags = document.createElement('div');
      tags.className = 'tags';

      for (const t of it.tematica.slice(0, 12)) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        tag.title = 'Alternar filtro: temática';
        tag.addEventListener('click', () => toggleFacet('tematica', t, !state.filters.tematica.has(t)));
        tags.appendChild(tag);
      }

      for (const c of it.convo.slice(0, 8)) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = c;
        tag.title = 'Alternar filtro: convocatoria';
        tag.addEventListener('click', () => toggleFacet('convo', c, !state.filters.convo.has(c)));
        tags.appendChild(tag);
      }

      // Material links
      const mats = document.createElement('div');
      mats.className = 'materials';

      if (it.web) mats.appendChild(linkEl('Web', it.web));
      if (it.pdf) mats.appendChild(linkEl('PDF', it.pdf));
      for (const v of it.videos.slice(0, 2)) mats.appendChild(linkEl('Vídeo', v));
      for (const u of it.links.slice(0, 2)) mats.appendChild(linkEl('Enlace', u));

      // Actions
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Ver matches';
      btn.addEventListener('click', () => openMatchModal(it.id));
      actions.appendChild(btn);

      // Hidden fields for List.js search (valueNames)
      const hiddenTem = document.createElement('span');
      hiddenTem.className = 'keywords_tematica';
      hiddenTem.hidden = true;
      hiddenTem.textContent = it.tematica.join(' ');

      const hiddenCon = document.createElement('span');
      hiddenCon.className = 'keywords_convo';
      hiddenCon.hidden = true;
      hiddenCon.textContent = it.convo.join(' ');

      // Assemble
      li.appendChild(header);
      li.appendChild(p);
      if (it.tematica.length || it.convo.length) li.appendChild(tags);
      if (it.web || it.pdf || it.videos.length || it.links.length) li.appendChild(mats);
      li.appendChild(actions);
      li.appendChild(hiddenTem);
      li.appendChild(hiddenCon);

      els.cards.appendChild(li);
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
    if (!state.list) return;

    const f = state.filters;

    state.list.filter((item) => {
      const el = item.elm;
      const type = el.dataset.type || 'unknown';

      if (f.type !== 'all' && type !== f.type) return false;

      const tem = (el.dataset.tematica || '').split('|').filter(Boolean);
      const con = (el.dataset.convo || '').split('|').filter(Boolean);

      if (!hasIntersection(tem, f.tematica)) return false;
      if (!hasIntersection(con, f.convo)) return false;

      return true;
    });

    updateCountAndEmpty();
  }

  function clearFilters() {
    state.filters.type = 'all';
    state.filters.tematica.clear();
    state.filters.convo.clear();

    // Reset UI
    els.typeRadios.forEach((r) => { r.checked = (r.value === 'all'); });

    root.querySelectorAll('.facet input[type="checkbox"]').forEach((cb) => { cb.checked = false; });

    // Clear search
    const q = document.getElementById('q');
    if (q) q.value = '';

    if (state.list) {
      state.list.search('');
      state.list.filter(); // remove filters
    }
    updateCountAndEmpty();
  }

  function updateCountAndEmpty() {
    if (!state.list) return;
    const n = state.list.matchingItems?.length ?? 0;
    els.count.textContent = String(n);
    els.empty.hidden = n !== 0;
  }

  // ---------- Matching modal ----------

  function openMatchModal(sourceId) {
    const src = state.byId.get(sourceId);
    if (!src) return;

    const targetType = src.type === 'empresa' ? 'grupo' : 'empresa';
    const candidates = state.data.filter((x) => x.type === targetType);

    const scored = candidates
      .map((x) => {
        const t = jaccard(src.tematica, x.tematica);
        const c = jaccard(src.convo, x.convo);
        const score = 0.7 * t + 0.3 * c;
        return {
          item: x,
          score,
          commonTem: commonTags(src.tematica, x.tematica, 6),
          commonCon: commonTags(src.convo, x.convo, 6),
        };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const top = document.createElement('div');
    top.className = 'modal-top';

    const title = document.createElement('div');
    title.innerHTML = `<h3>Matches para: ${escapeHtml(src.name)}</h3>
                       <div class="hint">Buscando ${escapeHtml(targetType)}s con solape en keywords.</div>`;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = 'Cerrar';
    close.addEventListener('click', () => backdrop.remove());

    top.appendChild(title);
    top.appendChild(close);

    const body = document.createElement('div');

    if (!scored.length) {
      body.innerHTML = `<p><strong>No hay matches claros aún.</strong></p>
                        <p class="hint">Sugerencia: anima a usar un vocabulario controlado de keywords (lista cerrada) para mejorar el solape.</p>`;
    } else {
      const ul = document.createElement('ul');
      ul.className = 'match-list';

      scored.slice(0, 12).forEach((m) => {
        const li = document.createElement('li');
        li.className = 'match-item';

        const row = document.createElement('div');
        row.className = 'row';

        const left = document.createElement('div');
        left.className = 'title';
        left.textContent = m.item.name;

        const right = document.createElement('div');
        right.className = 'score';
        right.textContent = `score ${fmtScore(m.score)}`;

        row.appendChild(left);
        row.appendChild(right);

        const why = document.createElement('div');
        why.className = 'why';

        const parts = [];
        if (m.commonTem.length) parts.push(`Temática común: ${m.commonTem.join(', ')}`);
        if (m.commonCon.length) parts.push(`Convocatorias comunes: ${m.commonCon.join(', ')}`);
        why.textContent = parts.join(' · ');

        li.appendChild(row);
        li.appendChild(why);
        ul.appendChild(li);
      });

      body.appendChild(ul);
    }

    modal.appendChild(top);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  // ---------- Init ----------

  async function init() {
    try {
      const rows = await loadCsvObjects(CSV_URL);

      const items = rows
        .map((r, i) => toItem(r, i))
        .filter((x) => x.name || x.summary); // quita filas vacías

      state.data = items;
      state.byId = new Map(items.map((x) => [x.id, x]));

      renderCards(items);
      buildFacets(items);

      // List.js: usar el root id como contenedor
      state.list = new List('matchapp', {
        valueNames: ['name', 'summary', 'keywords_tematica', 'keywords_convo'],
      });

      // cuenta inicial
      state.list.on('updated', updateCountAndEmpty);
      updateCountAndEmpty();

      // radios tipo
      els.typeRadios.forEach((r) => {
        r.addEventListener('change', () => {
          if (!r.checked) return;
          state.filters.type = r.value;
          applyFilters();
        });
      });

      // clear
      if (els.clear) els.clear.addEventListener('click', clearFilters);
    } catch (err) {
      console.error(err);
      renderFatal('Error cargando el directorio', String(err?.message || err));
    }
  }

  init();
})();
