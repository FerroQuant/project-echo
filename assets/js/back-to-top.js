(function () {
  'use strict';
  var btn = document.getElementById('back-to-top');
  if (!btn) return;
  var visible = false;
  window.addEventListener('scroll', function () {
    var show = window.scrollY > 400;
    if (show !== visible) {
      visible = show;
      btn.classList.toggle('is-visible', show);
    }
  }, { passive: true });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
