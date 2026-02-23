(function () {
  'use strict';

  var searchForm = document.getElementById('search-form');
  var searchInput = document.getElementById('search-input');
  var resultsContainer = document.getElementById('search-results');
  var countEl = document.getElementById('search-count');

  if (!searchForm || !searchInput || !resultsContainer) return;

  var lunrIndex = null;
  var documents = {};

  // -------------------------------------------------------------------------
  // Load search index via XHR
  // -------------------------------------------------------------------------
  function loadIndex(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', searchForm.dataset.indexUrl || '/assets/search-index.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        var data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          console.error('Failed to parse search index', e);
          return;
        }
        // Store documents by id
        data.forEach(function (doc) {
          documents[doc.id] = doc;
        });
        // Build lunr index
        lunrIndex = lunr(function () {
          this.ref('id');
          this.field('title', { boost: 10 });
          this.field('body');
          data.forEach(function (doc) {
            this.add(doc);
          }, this);
        });
        callback();
      }
    };
    xhr.send();
  }

  // -------------------------------------------------------------------------
  // Render results
  // -------------------------------------------------------------------------
  function renderResults(query) {
    // Clear previous results (safe DOM removal)
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
      hits = [];
    }

    if (countEl) {
      countEl.textContent = hits.length === 0
        ? 'No results found.'
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

      // Title link
      var h3 = document.createElement('h3');
      var a = document.createElement('a');
      a.href = doc.url;
      // External links (Facebook posts) open in new tab
      if (doc.url.indexOf('http') === 0) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.textContent = doc.title;
      h3.appendChild(a);
      article.appendChild(h3);

      // Snippet
      if (doc.body) {
        var p = document.createElement('p');
        p.className = 'search-result__snippet';
        p.textContent = doc.body.substring(0, 180) + (doc.body.length > 180 ? '\u2026' : '');
        article.appendChild(p);
      }

      resultsContainer.appendChild(article);
    });
  }

  // -------------------------------------------------------------------------
  // Form submit handler
  // -------------------------------------------------------------------------
  function handleSearch(e) {
    if (e) e.preventDefault();
    var query = searchInput.value;

    // Update URL without reloading
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

  searchForm.addEventListener('submit', handleSearch);

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
