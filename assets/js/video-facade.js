/**
 * video-facade.js — Lightweight Facebook video facade.
 * Shows a static thumbnail + play button instead of loading a heavy iframe.
 * On click/Enter, replaces with the real Facebook iframe embed.
 * Uses event delegation for efficiency with many cards.
 */
(function () {
  'use strict';

  function createIframe(wrapper) {
    var videoId = wrapper.getAttribute('data-video-id');
    if (!videoId) return null;
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fthewellreading%2Fvideos%2F' + encodeURIComponent(videoId) + '%2F&show_text=false&autoplay=true&appId';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');
    iframe.setAttribute('loading', 'lazy');
    iframe.style.border = 'none';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.title = wrapper.getAttribute('data-title') || 'Facebook Video';
    return iframe;
  }

  function activateFacade(wrapper) {
    if (wrapper.classList.contains('video-facade--active')) return;
    try {
      var iframe = createIframe(wrapper);
      if (!iframe) {
        showFallback(wrapper);
        return;
      }
      wrapper.textContent = '';
      wrapper.appendChild(iframe);
      wrapper.classList.add('video-facade--active');
    } catch (e) {
      showFallback(wrapper);
    }
  }

  function showFallback(wrapper) {
    var videoId = wrapper.getAttribute('data-video-id');
    var link = document.createElement('a');
    link.href = 'https://www.facebook.com/thewellreading/videos/' + (videoId || '');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Watch on Facebook';
    link.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-weight:600;text-decoration:underline;';
    wrapper.textContent = '';
    wrapper.appendChild(link);
  }

  // Event delegation — single listener on document for all facades
  document.addEventListener('click', function (e) {
    var facade = e.target.closest('.video-facade');
    if (facade) activateFacade(facade);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var facade = e.target.closest('.video-facade');
      if (facade) {
        e.preventDefault();
        activateFacade(facade);
      }
    }
  });
})();
