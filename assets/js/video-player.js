(function() {
  'use strict';
  var video = document.querySelector('.video-element');
  var segments = document.querySelectorAll('.transcript-segment');
  if (!video || !segments.length) return;

  function parseTime(timeStr) {
    if (!timeStr) return 0;
    var parts = timeStr.split(':');
    if (parts.length === 3) return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
    if (parts.length === 2) return (+parts[0]) * 60 + (+parts[1]);
    return +parts[0] || 0;
  }

  for (var i = 0; i < segments.length; i++) {
    segments[i].addEventListener('click', function() {
      var seconds = parseTime(this.dataset.time);
      video.currentTime = seconds;
      video.play().catch(function() { /* autoplay may be blocked */ });
    });
  }

  var ticking = false;
  video.addEventListener('timeupdate', function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      var current = video.currentTime;
      for (var j = 0; j < segments.length; j++) {
        var segTime = parseTime(segments[j].dataset.time);
        segments[j].classList.toggle('is-active', Math.abs(current - segTime) < 5);
      }
      ticking = false;
    });
  });
})();
