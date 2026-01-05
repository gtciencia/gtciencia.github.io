(() => {
  'use strict';

  const body = document.getElementById('itemBody');
  const back = document.getElementById('backLink');

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
    return s;
  }

  function splitTags(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return [];
    return s
      .split(/[,;\n|]+/g)
      .map(x => String(x).trim().toLowerCase())
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

    // Tomamos el CSV desde /match/ leyendo un atributo inyectado por tu página principal:
    // fallback: si lo prefieres, pega aquí la URL fija del CSV
    // const CSV_URL = "TU_URL_CSV";
    // Pero mejor: guardarlo en window.__MATCH_CSV__ desde match.js (lo hacemos ahora).
    const CSV_URL = window.__MATCH_CSV__;
    if (!CSV_URL) {
      body.innerHTML = `<p><strong>No se encuentra la URL del CSV.</strong> Abre primero el directorio /match/ o define window.__MATCH_CSV__.</p>`;
      return;
    }

    const rows = await loadCsvObjects(CSV_URL);

    const items = rows.map((row, idx) => {
      const type = normalizeType(pick(row, ['Tipo', 'type', 'TYPE', 'Tipo de entidad']));
      const name = String(pick(row, ['Nombre', 'Nombre de la entidad', 'Name', 'Entidad'])).trim();

      // Campo LARGO (1200) del formulario:
      const summaryLong = String(pick(row, [
        'Resumen corto de actividades (máx. 1200 caracteres)',
        'Resumen corto de actividades (máx. 1200 caracteres).',
        'Resumen corto de actividades',
        'Resumen largo',
        'Resumen'
      ])).trim();

      const tematica = splitTags(pick(row, ['Keywords temática', 'Temática', 'Tematica', 'Tags', 'Keywords']));
      const convo = splitTags(pick(row, ['Keywords convocatorias', 'Convocatorias', 'Calls', 'Programas']));

      const web = safeUrl(String(pick(row, ['Web', 'Website', 'URL', 'Pagina web', 'Página web'])).trim());
      const pdf = safeUrl(String(pick(row, ['PDF', 'Material PDF', 'Enlace PDF'])).trim());

      // Id consistente (marca temporal suele existir)
      const idRaw = pick(row, ['ID', 'Id', 'id', 'Timestamp', 'Marca temporal']);
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
        videos: [],
        links: [],
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
