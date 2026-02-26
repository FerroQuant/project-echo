/**
 * reviews.js — Fetch and render Google reviews from worker proxy.
 * Renders star ratings, review text, and links to Google Maps.
 * Uses safe DOM methods — no innerHTML.
 */
(function () {
  'use strict';

  var container = document.getElementById('google-reviews');
  if (!container) return;

  var endpoint = container.getAttribute('data-endpoint');
  if (!endpoint) return;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function renderStars(parent, rating) {
    for (var i = 1; i <= 5; i++) {
      var star = el('span', '', '');
      star.setAttribute('aria-hidden', 'true');
      if (i <= Math.floor(rating)) {
        star.className = 'review-star review-star--full';
        star.textContent = '\u2605';
      } else if (i - rating < 1) {
        star.className = 'review-star review-star--half';
        star.textContent = '\u2605';
      } else {
        star.className = 'review-star review-star--empty';
        star.textContent = '\u2606';
      }
      parent.appendChild(star);
    }
  }

  function truncateText(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max).replace(/\s+\S*$/, '') + '\u2026';
  }

  function renderReviews(data) {
    if (!data || !data.reviews || data.reviews.length === 0) {
      container.style.display = 'none';
      return;
    }

    var topReviews = data.reviews
      .filter(function (r) { return r.rating >= 4; })
      .slice(0, 3);

    if (topReviews.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Summary: overall rating + count
    var summary = el('div', 'reviews-summary');
    var ratingWrap = el('div', 'reviews-summary__rating');
    ratingWrap.appendChild(el('span', 'reviews-summary__number', String(data.rating)));
    var starsWrap = el('div', 'reviews-summary__stars');
    renderStars(starsWrap, data.rating);
    ratingWrap.appendChild(starsWrap);
    ratingWrap.appendChild(el('span', 'reviews-summary__count', data.total_reviews + ' reviews on Google'));
    summary.appendChild(ratingWrap);

    // Review cards
    var grid = el('div', 'reviews-grid');
    for (var i = 0; i < topReviews.length; i++) {
      var r = topReviews[i];
      var card = el('div', 'review-card');

      var header = el('div', 'review-card__header');
      if (r.photo) {
        var img = document.createElement('img');
        img.src = r.photo;
        img.alt = '';
        img.className = 'review-card__photo';
        img.loading = 'lazy';
        header.appendChild(img);
      } else {
        header.appendChild(el('div', 'review-card__photo-placeholder'));
      }
      var authorWrap = el('div', 'review-card__author');
      authorWrap.appendChild(el('span', 'review-card__name', r.author || 'Anonymous'));
      authorWrap.appendChild(el('span', 'review-card__time', r.time || ''));
      header.appendChild(authorWrap);
      card.appendChild(header);

      var cardStars = el('div', 'review-card__stars');
      renderStars(cardStars, r.rating);
      card.appendChild(cardStars);

      card.appendChild(el('p', 'review-card__text', truncateText(r.text, 200)));
      grid.appendChild(card);
    }

    // CTA link
    var cta = el('div', 'reviews-cta');
    if (data.maps_url) {
      var link = document.createElement('a');
      link.href = data.maps_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'btn--outline-primary';
      link.textContent = 'See All Reviews on Google \u2192';
      cta.appendChild(link);
    }

    container.textContent = '';
    container.appendChild(summary);
    container.appendChild(grid);
    container.appendChild(cta);
    container.style.display = '';
  }

  fetch(endpoint)
    .then(function (resp) { return resp.json(); })
    .then(renderReviews)
    .catch(function () { container.style.display = 'none'; });
})();
