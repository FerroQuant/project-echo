/**
 * video-facade.js — Lightweight Facebook video facade.
 * Shows a static thumbnail + play button instead of loading a heavy iframe.
 * On click, replaces with the real Facebook iframe embed.
 */
(function () {
  'use strict';

  function createIframe(wrapper) {
    var videoId = wrapper.getAttribute('data-video-id');
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fthewellreading%2Fvideos%2F' + videoId + '%2F&show_text=false&appId';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share');
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
    var iframe = createIframe(wrapper);
    wrapper.textContent = '';
    wrapper.appendChild(iframe);
    wrapper.classList.add('video-facade--active');
  }

  // Attach click handlers to all facades
  var facades = document.querySelectorAll('.video-facade');
  for (var i = 0; i < facades.length; i++) {
    facades[i].addEventListener('click', function () {
      activateFacade(this);
    });
    facades[i].addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateFacade(this);
      }
    });
  }
})();
