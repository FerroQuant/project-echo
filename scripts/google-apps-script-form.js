/**
 * Google Apps Script — The Well Church Form Handler
 *
 * SETUP INSTRUCTIONS
 * ==================
 * 1. Go to https://script.google.com and create a new project.
 * 2. Paste this entire file into the editor, replacing any existing code.
 * 3. Update SHEET_ID below with the ID of the Google Sheet where you want
 *    submissions stored. The Sheet ID is the long string in its URL:
 *      https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
 *    If you leave SHEET_ID as an empty string the script will create a new
 *    Sheet automatically the first time it runs.
 * 4. Update NOTIFY_EMAIL below if you want notifications sent to a
 *    different address (defaults to life@thewell-church.com).
 * 5. Click Deploy > New deployment.
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Authorise the script when prompted.
 * 7. Copy the Web app URL that appears after deployment.
 * 8. Paste that URL into assets/js/forms.js on the website, replacing
 *    the GOOGLE_SCRIPT_URL placeholder.
 *
 * REDEPLOYMENT
 * ============
 * After changing this script you must create a NEW deployment (or choose
 * "Manage deployments" and update the existing one) for changes to take
 * effect. The URL stays the same when updating an existing deployment.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Google Sheet ID where submissions are stored. Leave empty to auto-create. */
var SHEET_ID = '';

/** Email address that receives form submission notifications. */
var NOTIFY_EMAIL = 'life@thewell-church.com';

/** Name shown in notification email From / Reply-To headers. */
var CHURCH_NAME = 'The Well Church';

/**
 * Cloudflare Turnstile secret key for server-side CAPTCHA validation.
 * Get this from: Cloudflare Dashboard > Turnstile > Your Site > Settings
 * Leave empty to skip CAPTCHA validation (for testing only).
 */
var TURNSTILE_SECRET = '0x4AAAAAAChTrMOVBguvKQwuljzwLiNjnKM';

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Entry point called by Google whenever the web app receives a POST request.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    var params = parseParams(e);
    validateTurnstile(params);
    validateParams(params);
    storeInSheet(params);
    sendNotificationEmail(params);
    return jsonResponse({ success: true, message: 'Submission received.' });
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ success: false, message: err.message }, 400);
  }
}

/**
 * Handle OPTIONS preflight (browsers send this before cross-origin POST).
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  // Useful for a quick health-check: visit the URL in a browser.
  return jsonResponse({ success: true, message: 'The Well Church form handler is running.' });
}

// ─── Parameter parsing ────────────────────────────────────────────────────────

/**
 * Extract and sanitise fields from the POST body.
 * Accepts both application/x-www-form-urlencoded and application/json bodies.
 */
function parseParams(e) {
  var raw = {};

  // JSON body (sent by fetch with Content-Type: application/json)
  if (e && e.postData && e.postData.type === 'application/json') {
    try {
      raw = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new Error('Invalid JSON in request body.');
    }
  } else if (e && e.parameter) {
    // Form-encoded body
    raw = e.parameter;
  }

  var parsed = {
    form_type:  sanitise(raw.form_type  || 'contact'),
    name:       sanitise(raw.name       || raw.first_name || ''),
    email:      sanitise(raw.email      || ''),
    phone:      sanitise(raw.phone      || ''),
    message:    sanitise(raw.message    || raw.prayer_request || ''),
    // Honeypot — should always be empty for legitimate submissions
    honeypot:   sanitise(raw._honeypot  || raw.website || ''),
    // Cloudflare Turnstile CAPTCHA token
    turnstile_token: raw['cf-turnstile-response'] || ''
  };

  // Building hire additional fields
  if (parsed.form_type === 'building_hire') {
    parsed.organisation_name = sanitise(raw.organisation_name || '');
    parsed.organisation_type = sanitise(raw.organisation_type || '');
    parsed.organisation_description = sanitise(raw.organisation_description || '');
    parsed.booking_type = sanitise(raw.booking_type || '');
    parsed.preferred_days_times = sanitise(raw.preferred_days_times || '');
    parsed.start_date = sanitise(raw.start_date || '');
    parsed.additional_info = sanitise(raw.additional_info || '');
  }

  return parsed;
}

/** Basic HTML-strip and trim to prevent formula injection in the Sheet. */
function sanitise(value) {
  if (typeof value !== 'string') return '';
  // Strip leading = + - @ characters that could be spreadsheet formulas
  return value.trim().replace(/^[=+\-@]/, '\'');
}

/**
 * Validate the Cloudflare Turnstile CAPTCHA token server-side.
 * Calls the Turnstile siteverify API to confirm the user is human.
 * Skips validation if TURNSTILE_SECRET is not configured (for testing).
 */
function validateTurnstile(params) {
  if (!TURNSTILE_SECRET || TURNSTILE_SECRET === 'TURNSTILE_SECRET_KEY') {
    // Secret not configured — skip validation (testing mode)
    return;
  }

  if (!params.turnstile_token) {
    throw new Error('CAPTCHA verification is required. Please try again.');
  }

  var response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      secret: TURNSTILE_SECRET,
      response: params.turnstile_token
    }),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());

  if (!result.success) {
    Logger.log('Turnstile validation failed: ' + JSON.stringify(result));
    throw new Error('CAPTCHA verification failed. Please refresh the page and try again.');
  }
}

/** Throw if a spam honeypot field has been filled, or required fields missing. */
function validateParams(params) {
  if (params.honeypot) {
    throw new Error('Submission rejected (spam filter).');
  }

  var isPrayer = params.form_type === 'prayer';
  var isHire = params.form_type === 'building_hire';

  if (!params.name) {
    throw new Error('Name is required.');
  }

  if (!isPrayer && !params.email) {
    throw new Error('Email is required.');
  }

  if (isHire) {
    if (!params.organisation_name) throw new Error('Organisation name is required.');
    if (!params.organisation_type) throw new Error('Organisation type is required.');
    if (!params.organisation_description) throw new Error('Organisation description is required.');
    if (!params.booking_type) throw new Error('Booking type is required.');
    if (!params.preferred_days_times) throw new Error('Preferred days and times are required.');
    if (!params.start_date) throw new Error('Start date is required.');
  } else if (!params.message) {
    throw new Error(isPrayer ? 'Prayer request is required.' : 'Message is required.');
  }

  if (params.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
    throw new Error('Please enter a valid email address.');
  }
}

// ─── Google Sheet storage ─────────────────────────────────────────────────────

/** Append one row to the correct tab in the Google Sheet. */
function storeInSheet(params) {
  var ss = openOrCreateSheet();
  var tabNames = {
    prayer: 'Prayer Requests',
    building_hire: 'Building Hire Enquiries',
    contact: 'Contact Messages'
  };
  var tabName = tabNames[params.form_type] || 'Contact Messages';
  var sheet = ss.getSheetByName(tabName) || createTab(ss, tabName, params.form_type);
  var now = new Date();

  if (params.form_type === 'prayer') {
    sheet.appendRow([
      now,
      params.name,
      params.phone,
      params.message
    ]);
  } else if (params.form_type === 'building_hire') {
    sheet.appendRow([
      now,
      params.organisation_name,
      params.organisation_type,
      params.organisation_description,
      params.name,
      params.email,
      params.phone,
      params.booking_type,
      params.preferred_days_times,
      params.start_date,
      params.additional_info
    ]);
  } else {
    sheet.appendRow([
      now,
      params.name,
      params.email,
      params.phone,
      params.message
    ]);
  }
}

/** Open the configured Sheet or create a new one named after the church. */
function openOrCreateSheet() {
  if (SHEET_ID) {
    return SpreadsheetApp.openById(SHEET_ID);
  }
  // Auto-create once; log the new ID so it can be saved in config
  var ss = SpreadsheetApp.create(CHURCH_NAME + ' — Form Submissions');
  SHEET_ID = ss.getId();
  Logger.log('Created new Sheet. ID: ' + SHEET_ID);
  return ss;
}

/** Create a tab with header row appropriate to the form type. */
function createTab(ss, tabName, formType) {
  var sheet = ss.insertSheet(tabName);
  if (formType === 'prayer') {
    sheet.appendRow(['Timestamp', 'First Name', 'Phone', 'Prayer Request']);
  } else if (formType === 'building_hire') {
    sheet.appendRow([
      'Timestamp', 'Organisation Name', 'Organisation Type', 'Organisation Description',
      'Contact Name', 'Email', 'Phone', 'Booking Type',
      'Preferred Days & Times', 'Start Date', 'Additional Information'
    ]);
  } else {
    sheet.appendRow(['Timestamp', 'Name', 'Email', 'Phone', 'Message']);
  }
  // Bold the header row
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  return sheet;
}

// ─── Email notification ───────────────────────────────────────────────────────

/** Send a formatted notification email to NOTIFY_EMAIL. */
function sendNotificationEmail(params) {
  var isPrayer = params.form_type === 'prayer';
  var isHire = params.form_type === 'building_hire';
  var subjects = {
    prayer: 'New Prayer Request — The Well Church Website',
    building_hire: 'New Building Hire Enquiry — The Well Church Website'
  };
  var subject = subjects[params.form_type] || 'New Contact Message — The Well Church Website';

  var body = buildEmailBody(params, isPrayer);

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    htmlBody: body,
    replyTo: params.email || NOTIFY_EMAIL,
    name: CHURCH_NAME + ' Website'
  });
}

/** Build an HTML email body from the submission details. */
function buildEmailBody(params, isPrayer) {
  var isHire = params.form_type === 'building_hire';
  var rows = '';

  rows += tableRow('Submitted', new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }));

  if (isHire) {
    rows += tableRow('Form', 'Building Hire Enquiry');
    rows += tableRow('Organisation', params.organisation_name || '—');
    rows += tableRow('Organisation Type', params.organisation_type || '—');
    rows += tableRow('About Organisation', nl2br(params.organisation_description));
    rows += tableRow('Contact Name', params.name || '—');
    rows += tableRow('Email', params.email || '—');
    if (params.phone) rows += tableRow('Phone', params.phone);
    rows += tableRow('Booking Type', params.booking_type || '—');
    rows += tableRow('Preferred Days & Times', nl2br(params.preferred_days_times));
    rows += tableRow('Start Date', params.start_date || '—');
    if (params.additional_info) rows += tableRow('Additional Info', nl2br(params.additional_info));
  } else {
    rows += tableRow('Form', isPrayer ? 'Prayer Request' : 'Contact Form');
    rows += tableRow(isPrayer ? 'First Name' : 'Name', params.name || '—');

    if (!isPrayer) {
      rows += tableRow('Email', params.email || '—');
    }

    if (params.phone) {
      rows += tableRow('Phone', params.phone);
    }

    rows += tableRow(isPrayer ? 'Prayer Request' : 'Message', nl2br(params.message));
  }

  return [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">',
    '<div style="background:#1e5fa8;padding:24px 32px;border-radius:8px 8px 0 0">',
    '<h1 style="color:#ffffff;margin:0;font-size:22px">',
    isHire ? 'New Building Hire Enquiry' : (isPrayer ? 'New Prayer Request' : 'New Contact Message'),
    '</h1>',
    '<p style="color:#c3d9f5;margin:8px 0 0">The Well Church Website</p>',
    '</div>',
    '<div style="background:#f9fafb;padding:32px;border-radius:0 0 8px 8px">',
    '<table style="width:100%;border-collapse:collapse">',
    '<tbody>',
    rows,
    '</tbody>',
    '</table>',
    '<p style="margin-top:24px;color:#6b7280;font-size:13px">',
    'This message was submitted via the church website form.',
    '</p>',
    '</div>',
    '</div>'
  ].join('');
}

function tableRow(label, value) {
  return [
    '<tr style="border-bottom:1px solid #e5e7eb">',
    '<td style="padding:12px 8px;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top;width:140px">',
    escapeHtml(label),
    '</td>',
    '<td style="padding:12px 8px;color:#111827;font-size:14px">',
    value,
    '</td>',
    '</tr>'
  ].join('');
}

function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Return a JSON TextOutput with CORS headers that allow requests from any
 * origin. Google Apps Script web apps require CORS to be set this way.
 */
function jsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script does not support custom HTTP status codes on web apps —
  // the HTTP status is always 200. Errors are signalled via { success: false }.
  return output;
}
