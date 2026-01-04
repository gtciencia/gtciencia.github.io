---
layout: page
title: Matching 
permalink: /match/
nav: true
nav_order: 1
---

<!--
Configura aquí tus URLs (Google Sheets en CSV + Google Form).
- csv_url: URL pública a CSV (desde "Publicar en la web" en Google Sheets)
- form_url: URL pública de tu Google Form (para que la gente envíe su ficha)
-->

<div id="matchapp"
     class="match-app"
     data-csv-url="https://docs.google.com/spreadsheets/d/e/2PACX-1vQeIaaWFgqIGzpKk4tOBTU0bAoE8A_Vwf01W4i-k7E8zJfOMVqhTVzffTaDmSIntZAF-b0yyyYv0b2S/pubhtml"
     data-form-url="https://forms.gle/yRAZqbp4tGaTmLaq7">

  <noscript>
    <p><strong>Esta página necesita JavaScript</strong> para cargar el directorio y aplicar filtros.</p>
  </noscript>

  <aside class="filters" aria-label="Filtros">
    <h2>Filtros</h2>

    <div class="block">
      <label for="q">Buscar</label>
      <input id="q" class="search" placeholder="Nombre, resumen, keyword…" />
      <p class="hint">Consejo: escribe “IA”, “Horizon”, “CDTI”…</p>
    </div>

    <div class="block">
      <div class="block-title">Tipo</div>
      <div class="radio-row">
        <label><input type="radio" name="type" value="all" checked> Ambos</label>
        <label><input type="radio" name="type" value="grupo"> Grupos</label>
        <label><input type="radio" name="type" value="empresa"> Empresas</label>
      </div>
    </div>

    <div class="block">
      <div class="block-title">Temática</div>
      <div id="facet-tematica" class="facet" role="group" aria-label="Filtro por temática"></div>
    </div>

    <div class="block">
      <div class="block-title">Convocatorias</div>
      <div id="facet-convo" class="facet" role="group" aria-label="Filtro por convocatorias"></div>
    </div>

    <div class="block actions">
      <button id="clearFilters" type="button">Limpiar filtros</button>
    </div>

    <div class="block submit">
      <p class="submit-title">¿Quieres aparecer en el directorio?</p>
      <a id="formLink" class="submit-link" href="#" target="_blank" rel="noopener">Enviar ficha (Google Form)</a>
      <p class="hint">
        Nota: si incluyes “Subida de archivo” en Google Forms, suele requerir iniciar sesión con Google.
      </p>
    </div>
  </aside>

  <main class="results" aria-label="Resultados">
    <div class="results-header">
      <div class="results-count"><span id="count">0</span> resultados</div>
      <div class="results-actions">
        <button class="sort" data-sort="name" type="button" title="Ordenar por nombre">Ordenar A→Z</button>
      </div>
    </div>

    <ul class="list cards" id="cards"></ul>

    <div class="empty" id="emptyState" hidden>
      <p><strong>No hay resultados con esos filtros.</strong></p>
      <p>Prueba a quitar alguna temática/convocatoria, o a borrar la búsqueda.</p>
    </div>
  </main>
</div>

<!-- Dependencias (gratuitas) -->
<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/list.js/2.3.1/list.min.js"></script>

<!-- Tu lógica -->
<link rel="stylesheet" href="{{ '/assets/match/match.css' | relative_url }}">
<script src="{{ '/assets/match/match.js' | relative_url }}"></script>
