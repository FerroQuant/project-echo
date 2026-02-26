/**
 * forms.js — Form submission logic for The Well Church website.
 * Posts to the self-hosted Cloudflare Worker at /api/form
 * (see workers/form-handler/ for the backend).
 */

(function () {
  'use strict';

  // ─── Phone validation ──────────────────────────────────────────────────────

  /**
   * Validate a UK-style phone number (or leave empty — phone is optional).
   * Returns true if empty (field is optional) or if the number looks valid.
   * Accepts formats like: 07700 900000, +44 7700 900000, 01234567890
   */
  function isValidPhone(value) {
    if (!value || value.trim() === '') return true;
    var digits = value.replace(/[\s\-().+]/g, '');
    return /^[0-9]{7,15}$/.test(digits);
  }

  // ─── DOM helpers (no innerHTML) ────────────────────────────────────────────

  function createEl(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'className') {
          el.className = attrs[key];
        } else {
          el.setAttribute(key, attrs[key]);
        }
      });
    }
    if (children) {
      children.forEach(function (child) {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function setText(el, text) {
    el.textContent = text;
  }

  // ─── Status message elements ───────────────────────────────────────────────

  /**
   * Find or create a status region below the submit button inside the form.
   * Uses aria-live so screen readers announce changes automatically.
   */
  function getStatusRegion(form) {
    var existing = form.querySelector('.form-status');
    if (existing) return existing;
    var region = createEl('div', {
      className: 'form-status',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    });
    form.appendChild(region);
    return region;
  }

  function clearStatus(region) {
    while (region.firstChild) {
      region.removeChild(region.firstChild);
    }
    region.className = 'form-status';
  }

  function showLoading(btn, region) {
    clearStatus(region);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');

    var spinner = createEl('span', { className: 'form-spinner', 'aria-hidden': 'true' });
    var loadingText = document.createTextNode(' Sending…');
    btn.insertBefore(spinner, btn.firstChild);
    btn.appendChild(loadingText);
  }

  function resetButton(btn) {
    btn.disabled = false;
    btn.setAttribute('aria-busy', 'false');
    // Remove any injected spinner or text nodes, restore original label
    // (the original text is stored as a data attribute when we first touch it)
    var originalLabel = btn.getAttribute('data-original-label');
    if (originalLabel) {
      setText(btn, originalLabel);
    }
  }

  function showError(btn, region, message) {
    resetButton(btn);
    clearStatus(region);
    region.className = 'form-status form-status--error';

    var icon = createEl('span', { 'aria-hidden': 'true' });
    setText(icon, '! ');

    var msg = createEl('span');
    setText(msg, message || 'Something went wrong. Please try again or email us directly.');

    region.appendChild(icon);
    region.appendChild(msg);
    region.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showFieldError(field, message) {
    field.setAttribute('aria-invalid', 'true');
    var errId = field.id + '-error';
    var existing = document.getElementById(errId);
    if (!existing) {
      var errEl = createEl('span', { className: 'field-error', id: errId, role: 'alert' });
      setText(errEl, message);
      field.parentNode.appendChild(errEl);
    } else {
      setText(existing, message);
    }
    field.setAttribute('aria-describedby', errId);
  }

  function clearFieldError(field) {
    field.removeAttribute('aria-invalid');
    var errId = field.id + '-error';
    var errEl = document.getElementById(errId);
    if (errEl) errEl.parentNode.removeChild(errEl);
  }

  // ─── Success state ─────────────────────────────────────────────────────────

  /**
   * Hide the form wrapper and reveal the thank-you element.
   * Falls back to showing a success message inside the form if no thank-you
   * element is found.
   */
  function showSuccess(formWrap, thankyouEl, region) {
    if (thankyouEl) {
      formWrap.style.display = 'none';
      thankyouEl.style.display = 'block';
      thankyouEl.focus();
      thankyouEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Fallback: green confirmation inside the form area
      clearStatus(region);
      region.className = 'form-status form-status--success';
      var tick = createEl('span', { 'aria-hidden': 'true' });
      setText(tick, '✓ ');
      var msg = createEl('strong');
      setText(msg, 'Message sent! We\'ll be in touch soon.');
      region.appendChild(tick);
      region.appendChild(msg);
      formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ─── Core submit handler ───────────────────────────────────────────────────

  /**
   * Attach a fetch-based submit handler to a form element.
   *
   * @param {HTMLFormElement} formEl     - The <form> element to handle.
   * @param {string}          scriptUrl - The Worker endpoint URL.
   * @param {object}          [options]
   * @param {string}          [options.formType]      - 'contact' or 'prayer'
   * @param {string}          [options.honeypotName]  - Name of the honeypot field
   * @param {string}          [options.thankyouId]    - ID of the thank-you element
   * @param {string}          [options.formWrapId]    - ID of the form wrapper element
   * @param {string}          [options.phoneFieldId]  - ID of phone field to validate
   */
  function handleFormSubmit(formEl, scriptUrl, options) {
    var opts = options || {};
    var formType    = opts.formType     || 'contact';
    var honeypotName = opts.honeypotName || '_honeypot';
    var thankyouId  = opts.thankyouId   || null;
    var formWrapId  = opts.formWrapId   || null;
    var phoneFieldId = opts.phoneFieldId || null;

    var submitBtn = formEl.querySelector('[type="submit"]');
    if (!submitBtn) return;

    // Store original button label so we can restore it on error
    submitBtn.setAttribute('data-original-label', submitBtn.textContent.trim());

    var statusRegion = getStatusRegion(formEl);

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();

      // ── Honeypot check ───────────────────────────────────────────────────
      var honeypot = formEl.querySelector('[name="' + honeypotName + '"]');
      if (honeypot && honeypot.value) {
        // Silently succeed — do not submit
        var formWrap = formWrapId ? document.getElementById(formWrapId) : formEl.parentNode;
        var thankyou = thankyouId ? document.getElementById(thankyouId) : null;
        showSuccess(formWrap, thankyou, statusRegion);
        return;
      }

      // ── Phone validation (if a phone field is present) ───────────────────
      if (phoneFieldId) {
        var phoneField = document.getElementById(phoneFieldId);
        if (phoneField) {
          clearFieldError(phoneField);
          if (!isValidPhone(phoneField.value)) {
            showFieldError(phoneField, 'Please enter a valid phone number, or leave this field empty.');
            phoneField.focus();
            return;
          }
        }
      }

      // ── Required checkbox validation ────────────────────────────────────
      var requiredCheckboxes = formEl.querySelectorAll('input[type="checkbox"][required]');
      for (var c = 0; c < requiredCheckboxes.length; c++) {
        var cb = requiredCheckboxes[c];
        var cbLabel = cb.closest('label') || cb.parentNode;
        if (!cb.checked) {
          cbLabel.classList.add('checkbox-label--error');
          showError(submitBtn, statusRegion, 'Please agree to the no-alcohol policy before submitting.');
          cb.focus();
          return;
        } else {
          cbLabel.classList.remove('checkbox-label--error');
        }
      }

      // ── Turnstile CAPTCHA check ─────────────────────────────────────────
      var turnstileResponse = formEl.querySelector('[name="cf-turnstile-response"]');
      if (turnstileResponse && !turnstileResponse.value) {
        showError(submitBtn, statusRegion, 'Please complete the CAPTCHA verification.');
        return;
      }

      // ── Build payload ────────────────────────────────────────────────────
      var data = { form_type: formType, _honeypot: '' };

      // Include enquiry type when present
      var enquiryField = formEl.querySelector('[name="enquiry_type"]');
      if (enquiryField && enquiryField.value) {
        data.enquiry_type = enquiryField.value;
      }

      var fields = formEl.querySelectorAll('input, textarea, select');
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var name  = field.getAttribute('name');
        if (!name || name === honeypotName) continue;
        if (field.type === 'checkbox' || field.type === 'radio') {
          if (field.checked) data[name] = field.value;
        } else {
          data[name] = field.value;
        }
      }

      // Include Turnstile token for server-side validation
      if (turnstileResponse && turnstileResponse.value) {
        data['cf-turnstile-response'] = turnstileResponse.value;
      }

      // ── Loading state ────────────────────────────────────────────────────
      showLoading(submitBtn, statusRegion);

      // ── Fetch ────────────────────────────────────────────────────────────
      fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (response) {
          return response.json().then(function (json) {
            return { ok: response.ok, body: json };
          });
        })
        .then(function (result) {
          // Worker returns { success: true/false, message?: string }
          if (result.body && result.body.success) {
            var formWrap = formWrapId ? document.getElementById(formWrapId) : formEl.parentNode;
            var thankyou = thankyouId ? document.getElementById(thankyouId) : null;
            showSuccess(formWrap, thankyou, statusRegion);
          } else {
            var errMsg = (result.body && result.body.message)
              ? result.body.message
              : 'Something went wrong. Please try again.';
            showError(submitBtn, statusRegion, errMsg);
          }
        })
        .catch(function () {
          showError(
            submitBtn,
            statusRegion,
            'Could not send your message. Please check your connection and try again.'
          );
        });
    });

    // Clear inline field errors as user corrects their input
    var allFields = formEl.querySelectorAll('input, textarea');
    for (var j = 0; j < allFields.length; j++) {
      allFields[j].addEventListener('input', function () {
        clearFieldError(this);
      });
    }

    // Clear checkbox error styling on change
    var checkboxes = formEl.querySelectorAll('input[type="checkbox"][required]');
    for (var m = 0; m < checkboxes.length; m++) {
      checkboxes[m].addEventListener('change', function () {
        var lbl = this.closest('label') || this.parentNode;
        if (this.checked) {
          lbl.classList.remove('checkbox-label--error');
          clearStatus(statusRegion);
        }
      });
    }
  }

  // ─── Auto-initialize forms with data attributes ───────────────────────────
  // Any <form data-form-endpoint="..."> will be auto-initialized.
  // Supported data attributes:
  //   data-form-endpoint  (required) — Worker URL
  //   data-form-type      — 'contact', 'prayer', 'building_hire'
  //   data-honeypot-name  — honeypot field name (default: '_honeypot')
  //   data-thankyou-id    — ID of thank-you element
  //   data-form-wrap-id   — ID of form wrapper element
  //   data-phone-field-id — ID of phone field to validate
  //   data-subject-param  — URL param name to pre-select a <select> field
  var autoForms = document.querySelectorAll('form[data-form-endpoint]');
  for (var k = 0; k < autoForms.length; k++) {
    (function (formEl) {
      var endpoint = formEl.getAttribute('data-form-endpoint');
      if (!endpoint) return;

      handleFormSubmit(formEl, endpoint, {
        formType:     formEl.getAttribute('data-form-type') || 'contact',
        honeypotName: formEl.getAttribute('data-honeypot-name') || '_honeypot',
        thankyouId:   formEl.getAttribute('data-thankyou-id') || null,
        formWrapId:   formEl.getAttribute('data-form-wrap-id') || null,
        phoneFieldId: formEl.getAttribute('data-phone-field-id') || null
      });

      // Pre-select subject from URL param (e.g. /contact/?subject=worship-team)
      var subjectParam = formEl.getAttribute('data-subject-param');
      if (subjectParam) {
        var params = new URLSearchParams(window.location.search);
        var subject = params.get(subjectParam);
        if (subject) {
          var subjectMap = formEl.getAttribute('data-subject-map');
          if (subjectMap) {
            try {
              var map = JSON.parse(subjectMap);
              var select = formEl.querySelector('select[name="enquiry_type"]');
              if (select && map[subject]) {
                select.value = map[subject];
              }
            } catch (e) { /* ignore parse errors */ }
          }
        }
      }
    })(autoForms[k]);
  }

  // Keep global API for backwards compatibility
  window.WellForms = { handleFormSubmit: handleFormSubmit };
})();
