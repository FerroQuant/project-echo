(function() {
  var video = document.querySelector('.video-element');
  var segments = document.querySelectorAll('.transcript-segment');
  if (!video || !segments.length) return;

  segments.forEach(function(seg) {
    seg.addEventListener('click', function() {
      var timeParts = this.dataset.time.split(':');
      var seconds = (+timeParts[0]) * 3600 + (+timeParts[1]) * 60 + (+timeParts[2]);
      video.currentTime = seconds;
      video.play();
    });
  });

  video.addEventListener('timeupdate', function() {
    var current = video.currentTime;
    segments.forEach(function(seg) {
      var timeParts = seg.dataset.time.split(':');
      var segTime = (+timeParts[0]) * 3600 + (+timeParts[1]) * 60 + (+timeParts[2]);
      seg.classList.toggle('is-active', Math.abs(current - segTime) < 5);
    });
  });
})();
