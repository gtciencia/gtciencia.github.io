/* bridgeit/item.js — ficha individual (/bridgeit/item/)
   Carga el mismo CSV que el directorio y busca por ?id=
   Dependencias: PapaParse

   Novedades:
   - Muestra "Elevator pitch" (si existe)
   - Separa “Capacidades / temática” y “Convocatorias de interés”
   - Soporta logo/imagen (URL) y página ampliada (si existe)
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

  function safeHref(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const abs = safeUrl(s);
    if (abs) return abs;

    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return null;
  }

  function isExternalHref(href) {
    return /^https?:\/\//i.test(String(href || ''));
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

  function renderLinks(links) {
    if (!links.length) return '';
    return links.map(({ label, href }) => {
      const safe = safeHref(href);
      if (!safe) return '';
      const ext = isExternalHref(safe);
      const attrs = ext ? ` target="_blank" rel="noopener"` : '';
      return `<a href="${safe}"${attrs}>${escapeHtml(label)}</a>`;
    }).filter(Boolean).join(' ');
  }

  function renderTags(tags, kind) {
    if (!tags.length) return '<p class="hint">—</p>';
    return `<div class="tags">` + tags.map(t => {
      const cls = kind === 'convo' ? 'tag tag--convo' : 'tag tag--tem';
      return `<span class="${cls}">${escapeHtml(t)}</span>`;
    }).join(' ') + `</div>`;
  }

  function render(it) {
    const badge = it.type === 'empresa' ? 'Empresa' : 'Grupo de investigación';
    const cls = it.type === 'empresa' ? 'item-badge empresa' : 'item-badge grupo';

    // Links/material
    const mats = [];
    if (it.web) mats.push({ label: 'Web', href: it.web });
    if (it.pdf) mats.push({ label: 'PDF', href: it.pdf });
    for (const v of it.videos) mats.push({ label: 'Vídeo', href: v });
    for (const u of it.links) mats.push({ label: 'Enlace', href: u });

    // Página ampliada (opcional)
    const expanded = it.profileUrl ? safeHref(it.profileUrl) : null;

    body.innerHTML = `
      <div class="item-header">
        <div class="item-titlewrap">
          <h1 class="item-title">${escapeHtml(it.name || '(sin nombre)')}</h1>
          ${it.pitch ? `<p class="item-pitch">${escapeHtml(it.pitch)}</p>` : ''}
        </div>

        <div class="item-side">
          ${it.logo ? `<img class="item-logo" src="${escapeHtml(it.logo)}" alt="" loading="lazy">` : ''}
          <span class="${cls}">${badge}</span>
        </div>
      </div>

      ${expanded ? `
        <div class="item-callout">
          <strong>Ficha ampliada:</strong>
          <a href="${escapeHtml(expanded)}"${isExternalHref(expanded) ? ' target="_blank" rel="noopener"' : ''}>
            ${escapeHtml(expanded)}
          </a>
        </div>
      ` : ''}

      ${it.summaryLong ? `
        <div class="item-summary">
          <h3>Resumen de actividades</h3>
          <p>${escapeHtml(it.summaryLong)}</p>
        </div>
      ` : ''}

      <div class="item-tags">
        <h3>Capacidades / temática</h3>
        ${renderTags(it.tematica, 'tem')}
      </div>

      <div class="item-tags">
        <h3>Convocatorias de interés</h3>
        ${renderTags(it.convo, 'convo')}
      </div>

      ${mats.length ? `
        <div class="item-links">
          <h3>Material y enlaces</h3>
          <div class="materials">${renderLinks(mats)}</div>
        </div>
      ` : ''}
    `;
  }

  async function init() {
    const id = getParam('id');
    if (!id) {
      body.innerHTML = `<p><strong>Falta el parámetro <code>?id=</code>.</strong></p>`;
      return;
    }

    // 1) si vienes desde /bridgeit/, pasamos ?csv=... en el enlace.
    // 2) fallback: data-csv-url en el HTML de la página
    // 3) compat: window.__MATCH_CSV__
    const csvParam = getParam('csv');
    const CSV_URL = (csvParam || root?.dataset.csvUrl || window.__MATCH_CSV__ || '').trim();

    if (!CSV_URL) {
      body.innerHTML = `
        <p><strong>No se encuentra la URL del CSV.</strong></p>
        <p class="hint">Solución: abre esta ficha desde el directorio (/bridgeit/) o define <code>data-csv-url</code> en la página <code>/bridgeit/item/</code>.</p>
      `;
      return;
    }

    const rows = await loadCsvObjects(CSV_URL);

    const items = rows.map((row, idx) => {
      const type = normalizeType(pickSmart(
        row,
        ['Tipo', 'Eres...', 'type', 'TYPE', 'Entidad', 'Entity', 'Tipo de entidad'],
        [/^tipo/i, /eres/i, /entity/i]
      ));

      const name = String(pickSmart(
        row,
        ['Nombre de la entidad', 'Nombre', 'Name', 'Organización', 'Organizacion', 'Entidad', 'TITLE', 'Title'],
        [/^nombre/i, /organiza/i, /entidad/i, /name/i, /title/i]
      )).trim();

      const pitch = String(pickSmart(
        row,
        [
          'Elevator pitch',
          'Elevator Pitch',
          'Pitch',
          'Elevator pitch (máx. 280 caracteres)',
          'Propuesta de valor',
          'Mensaje corto',
          'Resumen en 1 frase',
        ],
        [/elevator/i, /\bpitch\b/i, /propuesta.*valor/i, /mensaje.*corto/i, /1\s*frase/i]
      )).trim();

      const summaryLong = String(pickSmart(
        row,
        [
          'Resumen corto de actividades (máx. 1200 caracteres)',
          'Resumen corto de actividades (máx. 1200 caracteres).',
          'Resumen corto de actividades',
          'Resumen largo',
          'Resumen',
          'Descripción',
          'Descripcion',
        ],
        [/resumen/i, /descrip/i]
      )).trim();

      const tematica = splitTags(pickSmart(
        row,
        ['Keywords temática', 'Keywords tematica', 'Temática', 'Tematica', 'TAGS', 'Tags', 'Keywords', 'Capacidades', 'Capacidades técnicas', 'Capacidades tecnicas'],
        [/temat/i, /capacidad/i, /keyword.*tema/i, /\btags?\b/i]
      ));

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
          'Calls',
          'CALLS',
          'Programas',
          'Funding',
        ],
        [/convoc/i, /\bcalls?\b/i, /program/i, /funding/i]
      ));

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
        ],
        [/p(á|a)gina/i, /perfil/i, /\bprofile\b/i, /url.*(p(á|a)gina|perfil)/i]
      ));

      const logo = safeHref(pickSmart(
        row,
        ['Logo (URL)', 'Logo', 'Imagen (URL)', 'Imagen', 'Image URL', 'URL logo', 'URL imagen'],
        [/logo/i, /imagen/i, /\bimage\b/i]
      ));

      const web = safeUrl(String(pickSmart(
        row,
        ['Web', 'Website', 'URL', 'Url', 'Pagina web', 'Página web'],
        [/web/i, /website/i, /p(á|a)gina web/i]
      )).trim());

      const pdf = safeUrl(String(pickSmart(
        row,
        ['PDF', 'Pdf', 'Material PDF', 'Enlace PDF', 'PDF link'],
        [/\bpdf\b/i]
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
      const rid = String(idRaw || '').trim() || `row-${idx}`;

      return {
        id: rid,
        type: type === 'unknown' ? 'grupo' : type,
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
