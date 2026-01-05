---
layout: page
title: Ficha
permalink: /match/item/
nav: false
---

<div id="matchitem"
     class="match-item"
     data-csv-url=""
     data-back-url="{{ '/match/' | relative_url }}">
  <noscript>
    <p><strong>Esta página necesita JavaScript</strong> para cargar la ficha.</p>
  </noscript>

  <div class="item-top">
    <a id="backLink" href="{{ '/match/' | relative_url }}">← Volver al directorio</a>
  </div>

  <div id="itemBody" class="item-body">
    <p class="hint">Cargando ficha…</p>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
<link rel="stylesheet" href="{{ '/assets/match/match.css' | relative_url }}">
<script src="{{ '/assets/match/item.js' | relative_url }}"></script>
