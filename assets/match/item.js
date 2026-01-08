/* item.js — ficha individual (/match/item/)
   Carga el mismo CSV que el directorio y busca por ?id=
   Requisitos: PapaParse
*/
(() => {
  'use strict';

  const body = document.getElementById('itemBody');
  const root = document.getElementById('matchitem');

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  function extractUrls(raw) {
    const s = String(raw ?? '');
    const re = /(https?:\/\/[^\s,;]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(s)) !== null) out.push(m[1]);
    return out.filter((u, idx, arr) => arr.indexOf(u) === idx);
  }

  function pick(row, candidates) {
    for (const key of candidates) {
      if (key in row && String(row[key] ?? '').trim() !== '') return row[key];
    }
    return '';
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
      .filter((t, i, a) => a.indexOf(t) === i);
  }

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

  function render(it) {
    const badge = it.type === 'empresa' ? 'Empresa' : 'Grupo de investigación';
    const cls = it.type === 'empresa' ? 'item-badge empresa' : 'item-badge grupo';

    const tags = []
      .concat(it.tematica.map(t => `<span class="tag">${escapeHtml(t)}</span>`))
      .concat(it.convo.map(c => `<span class="tag">${escapeHtml(c)}</span>`))
      .join(' ');

    const links = [];
    if (it.web) links.push(`<a href="${it.web}" target="_blank" rel="noopener">Web</a>`);
    if (it.pdf) links.push(`<a href="${it.pdf}" target="_blank" rel="noopener">PDF</a>`);
    for (const v of it.videos) links.push(`<a href="${v}" target="_blank" rel="noopener">Vídeo</a>`);
    for (const u of it.links) links.push(`<a href="${u}" target="_blank" rel="noopener">Enlace</a>`);

    body.innerHTML = `
      <div class="item-header">
        <h1 class="item-title">${escapeHtml(it.name || '(sin nombre)')}</h1>
        <span class="${cls}">${badge}</span>
      </div>

      ${it.summaryLong ? `<div class="item-summary"><h3>Resumen</h3><p>${escapeHtml(it.summaryLong)}</p></div>` : ''}

      ${(it.tematica.length || it.convo.length) ? `<div class="item-tags"><h3>Keywords</h3><div class="tags">${tags}</div></div>` : ''}

      ${links.length ? `<div class="item-links"><h3>Material</h3><div class="materials">${links.join(' ')}</div></div>` : ''}
    `;
  }

  async function init() {
    const id = getParam('id');
    if (!id) {
      body.innerHTML = `<p><strong>Falta el parámetro <code>?id=</code>.</strong></p>`;
      return;
    }

    // 1) si vienes desde /match/, pasamos ?csv=... en el enlace.
    // 2) fallback: data-csv-url en match_item.md
    // 3) compat: window.__MATCH_CSV__
    const csvParam = getParam('csv');
    const CSV_URL = (csvParam || root?.dataset.csvUrl || window.__MATCH_CSV__ || '').trim();

    if (!CSV_URL) {
      body.innerHTML = `
        <p><strong>No se encuentra la URL del CSV.</strong></p>
        <p class="hint">Solución: abre esta ficha desde el directorio (/match/) o define <code>data-csv-url</code> en <code>match_item.md</code>.</p>
      `;
      return;
    }

    const rows = await loadCsvObjects(CSV_URL);

    const items = rows.map((row, idx) => {
      const type = normalizeType(pick(row, [
        'Tipo', 'Eres...', 'type', 'TYPE', 'Entidad', 'Entity', 'Tipo de entidad'
      ]));

      const name = String(pick(row, [
        'Nombre de la entidad', 'Nombre', 'Name', 'Organización', 'Organizacion', 'Entidad', 'TITLE', 'Title'
      ])).trim();

      const summaryLong = String(pick(row, [
        'Resumen corto de actividades (máx. 1200 caracteres)',
        'Resumen corto de actividades (máx. 1200 caracteres).',
        'Resumen corto de actividades',
        'Resumen largo',
        'Resumen',
        'Descripción',
        'Descripcion',
      ])).trim();

      const tematica = splitTags(pick(row, [
        'Keywords temática', 'Keywords tematica', 'Temática', 'Tematica', 'TAGS', 'Tags', 'Keywords'
      ]));

      const convo = splitTags(pick(row, [
        'Keywords convocatorias',
        'Keywords convocatoria',
        'Convocatorias',
        'Calls',
        'CALLS',
        'Programas',
      ]));

      const web = safeUrl(String(pick(row, ['Web', 'Website', 'URL', 'Url', 'Pagina web', 'Página web'])).trim());
      const pdf = safeUrl(String(pick(row, ['PDF', 'Pdf', 'Material PDF', 'Enlace PDF', 'PDF link'])).trim());

      const videos = extractUrls(pick(row, ['Vídeos', 'Videos', 'Video', 'YouTube', 'Vimeo']))
        .map(safeUrl).filter(Boolean);

      const links = extractUrls(pick(row, ['Enlaces', 'Links', 'Material', 'MATERIAL']))
        .map(safeUrl).filter(Boolean);

      const idRaw = pick(row, ['ID', 'Id', 'id', 'Timestamp', 'Marca temporal', 'Marca temporal (timestamp)']);
      const rid = String(idRaw || '').trim() || `row-${idx}`;

      return {
        id: rid,
        type: type === 'unknown' ? 'grupo' : type,
        name,
        summaryLong,
        tematica,
        convo,
        pdf,
        web,
        videos,
        links,
      };
    });

    const it = items.find(x => String(x.id) === String(id));
    if (!it) {
      body.innerHTML = `<p><strong>No se encontró la ficha</strong> con id <code>${escapeHtml(id)}</code>.</p>`;
      return;
    }

    render(it);
  }

  init().catch(err => {
    console.error(err);
    body.innerHTML = `<p><strong>Error cargando la ficha</strong></p><p class="hint">${escapeHtml(err.message || String(err))}</p>`;
  });
})();
