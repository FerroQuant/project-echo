/**
 * protect.js — Basic copy/scrape protection for The Well Church website.
 * Disables right-click context menu, text selection, and common shortcuts.
 * Forms remain usable (inputs/textareas are excluded from selection block via CSS).
 */
(function () {
  'use strict';

  // Disable right-click context menu
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // Block copy/save/view-source keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    var key = e.key;
    // Ctrl+U (view source), Ctrl+S (save)
    if (e.ctrlKey && (key === 'u' || key === 'U' || key === 's' || key === 'S')) {
      e.preventDefault();
    }
    // Ctrl+Shift+I/J/C (dev tools, inspect element)
    if (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c')) {
      e.preventDefault();
    }
    // F12 (dev tools)
    if (key === 'F12') {
      e.preventDefault();
    }
    // Ctrl+P (print) — discourage printing to save content
    if (e.ctrlKey && (key === 'p' || key === 'P')) {
      e.preventDefault();
    }
  });

  // Disable drag on images
  document.addEventListener('dragstart', function (e) {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });

  // Prevent copy event on non-form elements
  document.addEventListener('copy', function (e) {
    var target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  });
})();
