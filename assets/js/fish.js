/**
 * fish.js — Interactive realistic fish that swim, avoid the mouse, and blow bubbles.
 * Part of The Well Church water theme.
 *
 * Uses photorealistic PNG images with transparent backgrounds.
 * All fish images face RIGHT — JS flips via scaleX(-1) when swimming left.
 * Fish are confined to the hero / page-header blue zone at the top.
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var tank = document.querySelector('.fish-tank');
  if (!tank) return;

  // ---- Fish image paths (all face RIGHT) — one of each, no duplicates ----
  var basePath = '/assets/images/fish/';
  var FISH_IMAGES = [
    'goldfish.png',
    'goldfish-red.png',
    'tiger-barb.png',
    'pink-snapper.png'
  ];

  // ---- Configuration ----
  var FISH_COUNT = FISH_IMAGES.length; // exactly one of each species
  var MOUSE_RADIUS = 150;
  var BASE_SPEED = 0.6;
  var FLEE_FORCE = 0.18;
  var EDGE_MARGIN = 60;
  var EDGE_FORCE = 0.05;
  var DAMPING = 0.992;
  var MAX_SPEED = 3.5;
  var BUBBLE_CHANCE = 0.003;
  var MAX_BUBBLES = 15;
  var DIR_CHANGE_MIN = 3000;
  var DIR_CHANGE_MAX = 8000;

  // ---- Determine the blue zone boundary (hero or page-header) ----
  var blueZone = document.querySelector('.hero') || document.querySelector('.page-header');
  var tankHeight = blueZone
    ? blueZone.getBoundingClientRect().bottom + 60 // include wave overlap
    : window.innerHeight * 0.5;

  // Apply height to fish-tank so fish stay in the blue area
  tank.style.height = tankHeight + 'px';
  tank.style.bottom = 'auto';

  // ---- Mouse tracking ----
  var mouseX = -9999, mouseY = -9999;

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  document.addEventListener('mouseleave', function () {
    mouseX = -9999;
    mouseY = -9999;
  });

  // Touch: scatter fish briefly on tap
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
      setTimeout(function () { mouseX = -9999; mouseY = -9999; }, 1200);
    }
  }, { passive: true });

  // ---- State ----
  var fishes = [];
  var activeBubbles = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function createFish(i) {
    var imgFile = FISH_IMAGES[i]; // no modulo — each fish is unique
    var size = rand(48, 80);
    var el = document.createElement('div');
    el.className = 'fish';
    el.style.width = size + 'px';

    var img = document.createElement('img');
    img.src = basePath + imgFile;
    img.alt = '';
    img.draggable = false;
    el.appendChild(img);

    tank.appendChild(el);

    var angle = Math.random() * Math.PI * 2;
    var speed = BASE_SPEED * rand(0.6, 1.4);

    return {
      el: el,
      x: rand(80, window.innerWidth - 80),
      y: rand(40, tankHeight - 80),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed: speed,
      size: size,
      nextDir: Date.now() + rand(DIR_CHANGE_MIN, DIR_CHANGE_MAX)
    };
  }

  // ---- Animation loop ----
  function update() {
    var w = window.innerWidth;
    var h = tankHeight; // constrain to blue zone, not full viewport
    var now = Date.now();

    for (var i = 0; i < fishes.length; i++) {
      var f = fishes[i];

      // Mouse avoidance
      var dx = f.x - mouseX;
      var dy = f.y - mouseY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_RADIUS && dist > 1) {
        var strength = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
        f.vx += (dx / dist) * strength * FLEE_FORCE;
        f.vy += (dy / dist) * strength * FLEE_FORCE;
      }

      // Random direction nudge
      if (now > f.nextDir) {
        var a = Math.random() * Math.PI * 2;
        f.vx += Math.cos(a) * f.speed * 0.5;
        f.vy += Math.sin(a) * f.speed * 0.5;
        f.nextDir = now + rand(DIR_CHANGE_MIN, DIR_CHANGE_MAX);
      }

      // Edge avoidance — constrained to blue zone
      if (f.x < EDGE_MARGIN) f.vx += EDGE_FORCE;
      else if (f.x > w - EDGE_MARGIN) f.vx -= EDGE_FORCE;
      if (f.y < EDGE_MARGIN) f.vy += EDGE_FORCE;
      else if (f.y > h - EDGE_MARGIN) f.vy -= EDGE_FORCE;

      // Damping
      f.vx *= DAMPING;
      f.vy *= DAMPING;

      // Clamp max speed
      var spd = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
      if (spd > MAX_SPEED) {
        f.vx = (f.vx / spd) * MAX_SPEED;
        f.vy = (f.vy / spd) * MAX_SPEED;
      }

      // Ensure minimum speed — keeps fish always moving (alive)
      if (spd < f.speed * 0.3 && spd > 0.01) {
        var boost = f.speed * 0.5 / spd;
        f.vx *= boost;
        f.vy *= boost;
      }

      // Update position
      f.x += f.vx;
      f.y += f.vy;

      // Hard clamp to blue zone (no wrapping — fish stay visible)
      if (f.x < -f.size) f.x = -f.size + 1;
      if (f.x > w + f.size) f.x = w + f.size - 1;
      if (f.y < 0) { f.y = 1; f.vy = Math.abs(f.vy) * 0.5; }
      if (f.y > h - f.size) { f.y = h - f.size - 1; f.vy = -Math.abs(f.vy) * 0.5; }

      // Render — flip based on swimming direction, tilt based on vertical movement
      var scaleX = f.vx < 0 ? -1 : 1;
      var tilt = Math.atan2(f.vy, Math.abs(f.vx)) * 15;
      f.el.style.transform =
        'translate(' + (f.x - f.size * 0.5).toFixed(1) + 'px,' +
        (f.y - f.size * 0.5).toFixed(1) + 'px) scaleX(' + scaleX +
        ') rotate(' + tilt.toFixed(1) + 'deg)';

      // Bubble spawning
      if (activeBubbles < MAX_BUBBLES && Math.random() < BUBBLE_CHANCE) {
        spawnBubble(f);
      }
    }

    requestAnimationFrame(update);
  }

  function spawnBubble(f) {
    activeBubbles++;
    var b = document.createElement('span');
    b.className = 'fish-bubble';
    var sz = rand(3, 7);
    b.style.width = sz + 'px';
    b.style.height = sz + 'px';
    // Spawn near fish mouth (front of fish based on direction)
    var mouthX = f.vx > 0 ? f.x + f.size * 0.35 : f.x - f.size * 0.35;
    b.style.left = mouthX + 'px';
    b.style.top = (f.y - f.size * 0.1) + 'px';
    tank.appendChild(b);
    b.addEventListener('animationend', function () {
      b.remove();
      activeBubbles--;
    });
  }

  // ---- Initialize — one fish per species ----
  for (var i = 0; i < FISH_COUNT; i++) {
    fishes.push(createFish(i));
  }

  requestAnimationFrame(update);
})();
