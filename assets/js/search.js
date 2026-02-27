(function () {
  'use strict';

  var searchForm = document.getElementById('search-form');
  var searchInput = document.getElementById('search-input');
  var resultsContainer = document.getElementById('search-results');
  var countEl = document.getElementById('search-count');

  if (!searchForm || !searchInput || !resultsContainer) return;

  var lunrIndex = null;
  var documents = {};
  var debounceTimer = null;

  // -------------------------------------------------------------------------
  // Load search index via fetch
  // -------------------------------------------------------------------------
  function loadIndex(callback) {
    var url = searchForm.dataset.indexUrl || '/assets/search-index.json';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        data.forEach(function (doc) {
          documents[doc.id] = doc;
        });
        lunrIndex = lunr(function () {
          this.ref('id');
          this.field('title', { boost: 10 });
          this.field('body');
          data.forEach(function (doc) {
            this.add(doc);
          }, this);
        });
        callback();
      })
      .catch(function (err) {
        console.error('Failed to load search index', err);
      });
  }

  // -------------------------------------------------------------------------
  // Safely highlight matching terms using DOM nodes (no innerHTML)
  // -------------------------------------------------------------------------
  function appendHighlighted(parent, text, query) {
    if (!query || !text) {
      parent.appendChild(document.createTextNode(text || ''));
      return;
    }
    var words = query.trim().split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var pattern = new RegExp('(' + words.map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|') + ')', 'gi');
    var parts = text.split(pattern);
    for (var i = 0; i < parts.length; i++) {
      if (pattern.test(parts[i])) {
        var mark = document.createElement('mark');
        mark.textContent = parts[i];
        parent.appendChild(mark);
      } else {
        parent.appendChild(document.createTextNode(parts[i]));
      }
      // Reset regex lastIndex since we're reusing it
      pattern.lastIndex = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Build a snippet around matching terms
  // -------------------------------------------------------------------------
  function buildSnippet(body, query) {
    if (!body) return '';
    var words = query.trim().split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length) return body.substring(0, 200);

    var lowerBody = body.toLowerCase();
    var firstPos = -1;
    for (var i = 0; i < words.length; i++) {
      var pos = lowerBody.indexOf(words[i].toLowerCase());
      if (pos !== -1 && (firstPos === -1 || pos < firstPos)) {
        firstPos = pos;
      }
    }

    if (firstPos === -1) return body.substring(0, 200);

    var start = Math.max(0, firstPos - 60);
    var end = Math.min(body.length, start + 200);
    return (start > 0 ? '\u2026' : '') + body.substring(start, end) + (end < body.length ? '\u2026' : '');
  }

  // -------------------------------------------------------------------------
  // Render results
  // -------------------------------------------------------------------------
  function renderResults(query) {
    while (resultsContainer.firstChild) {
      resultsContainer.removeChild(resultsContainer.firstChild);
    }

    if (!query.trim()) {
      if (countEl) countEl.textContent = '';
      return;
    }

    var hits;
    try {
      hits = lunrIndex.search(query);
    } catch (e) {
      try {
        hits = lunrIndex.search(query + '*');
      } catch (e2) {
        hits = [];
      }
    }

    if (countEl) {
      countEl.textContent = hits.length === 0
        ? 'No results found for \u201c' + query + '\u201d'
        : hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for \u201c' + query + '\u201d';
    }

    if (hits.length === 0) return;

    hits.forEach(function (hit) {
      var doc = documents[hit.ref];
      if (!doc) return;

      var article = document.createElement('article');
      article.className = 'search-result';

      // Type badge
      var badge = document.createElement('span');
      badge.className = 'search-result__type';
      badge.textContent = doc.type;
      article.appendChild(badge);

      // Title link (sanitise URL — reject javascript: protocol)
      var h3 = document.createElement('h3');
      var a = document.createElement('a');
      var safeUrl = (doc.url && !/^\s*javascript:/i.test(doc.url)) ? doc.url : '#';
      a.href = safeUrl;
      if (safeUrl.indexOf('http') === 0) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      appendHighlighted(a, doc.title, query);
      h3.appendChild(a);
      article.appendChild(h3);

      // Snippet with highlighted terms
      if (doc.body) {
        var p = document.createElement('p');
        p.className = 'search-result__snippet';
        var snippet = buildSnippet(doc.body, query);
        appendHighlighted(p, snippet, query);
        article.appendChild(p);
      }

      resultsContainer.appendChild(article);
    });
  }

  // -------------------------------------------------------------------------
  // Search handler
  // -------------------------------------------------------------------------
  function doSearch(query) {
    if (window.history && window.history.replaceState) {
      var params = new URLSearchParams(window.location.search);
      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      window.history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    }

    if (lunrIndex) {
      renderResults(query);
    } else {
      loadIndex(function () {
        renderResults(query);
      });
    }
  }

  // Form submit
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(debounceTimer);
    doSearch(searchInput.value);
  });

  // Live search-as-you-type with 300ms debounce
  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    var query = searchInput.value;
    debounceTimer = setTimeout(function () {
      doSearch(query);
    }, 300);
  });

  // -------------------------------------------------------------------------
  // Run on load if query param is present
  // -------------------------------------------------------------------------
  var params = new URLSearchParams(window.location.search);
  var initialQuery = params.get('q') || '';
  if (initialQuery) {
    searchInput.value = initialQuery;
    loadIndex(function () {
      renderResults(initialQuery);
    });
  }

})();
