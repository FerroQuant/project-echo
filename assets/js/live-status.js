(function () {
  var POLL_MS = 30000;
  var endpoint = '/api/live-status';
  var buttons = document.querySelectorAll('.js-live-btn');
  if (!buttons.length) return;

  function check() {
    fetch(endpoint).then(function (r) { return r.json(); }).then(function (d) {
      var show = d && d.is_live;
      buttons.forEach(function (btn) { btn.style.display = show ? '' : 'none'; });
    }).catch(function () { /* leave buttons hidden on error */ });
  }

  check();
  setInterval(function () {
    if (document.visibilityState !== 'hidden') check();
  }, POLL_MS);
})();
