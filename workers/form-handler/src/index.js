/**
 * Form Handler Worker — The Well Church
 *
 * Self-hosted Cloudflare Worker that receives form submissions,
 * validates Turnstile CAPTCHA server-side, and sends email via
 * Cloudflare Email Workers.
 *
 * Deploy: cd workers/form-handler && wrangler deploy
 * Secrets: wrangler secret put TURNSTILE_SECRET
 */

// Recipients — add/remove as needed
const TO_ADDRESS = 'rod@thewell-church.com';
const CC_ADDRESSES = [
  'keith@thewell-church.com',
  'tib@thewell-church.com',
  'nadew@thewell-church.com'
];
const FROM_ADDRESS = 'noreply@thewell-church.com';
const FROM_NAME = 'The Well Church Website';

const ALLOWED_ORIGINS = [
  'https://thewell-church.com',
  'https://www.thewell-church.com'
];

// Simple in-memory rate limit: max 5 submissions per IP per 10 minutes
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const ipTimestamps = new Map();

function checkRateLimit(ip) {
  var now = Date.now();
  var timestamps = ipTimestamps.get(ip) || [];
  timestamps = timestamps.filter(function (t) { return now - t < RATE_WINDOW_MS; });
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  ipTimestamps.set(ip, timestamps);
  return true;
}

function corsHeaders(origin) {
  var allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1;
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
  });
}

// Validate Turnstile token server-side
async function validateTurnstile(token, ip, secret) {
  var resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'secret=' + encodeURIComponent(secret) + '&response=' + encodeURIComponent(token) + '&remoteip=' + encodeURIComponent(ip)
  });
  var result = await resp.json();
  return result.success === true;
}

// Escape HTML entities for safe email rendering
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build email HTML body from form data
function buildEmailHtml(data) {
  var formType = data.form_type || 'contact';
  var title = 'New ' + formType.charAt(0).toUpperCase() + formType.slice(1) + ' Submission';

  var rows = '';
  var skipFields = ['form_type', '_honeypot', 'cf-turnstile-response', '_subject', '_captcha', '_template', '_autoresponse'];
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (skipFields.indexOf(key) !== -1) continue;
    if (!data[key]) continue;
    var label = key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    rows += '<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:600;vertical-align:top;width:160px">'
      + esc(label) + '</td><td style="padding:8px 12px;border:1px solid #ddd">'
      + esc(data[key]).replace(/\n/g, '<br>') + '</td></tr>';
  }

  return '<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px">'
    + '<h2 style="color:#1a5c5e">' + esc(title) + '</h2>'
    + '<table style="border-collapse:collapse;width:100%">' + rows + '</table>'
    + '<p style="color:#888;font-size:12px;margin-top:24px">Sent from thewell-church.com form handler</p>'
    + '</body></html>';
}

// Build raw MIME email
function buildMimeMessage(subject, htmlBody) {
  var boundary = 'boundary' + Date.now();
  var toHeader = TO_ADDRESS;
  var ccHeader = CC_ADDRESSES.length > 0 ? CC_ADDRESSES.join(', ') : '';

  var mime = 'From: "' + FROM_NAME + '" <' + FROM_ADDRESS + '>\r\n'
    + 'To: ' + toHeader + '\r\n';
  if (ccHeader) {
    mime += 'Cc: ' + ccHeader + '\r\n';
  }
  mime += 'Subject: ' + subject + '\r\n'
    + 'MIME-Version: 1.0\r\n'
    + 'Content-Type: multipart/alternative; boundary="' + boundary + '"\r\n'
    + '\r\n'
    + '--' + boundary + '\r\n'
    + 'Content-Type: text/html; charset=UTF-8\r\n'
    + 'Content-Transfer-Encoding: quoted-printable\r\n'
    + '\r\n'
    + htmlBody + '\r\n'
    + '--' + boundary + '--\r\n';

  return mime;
}

export default {
  async fetch(request, env) {
    var origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Method not allowed' }, 405, origin);
    }

    // Rate limit by IP
    var ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    if (!checkRateLimit(ip)) {
      return jsonResponse({ success: false, message: 'Too many submissions. Please try again later.' }, 429, origin);
    }

    // Parse JSON body
    var data;
    try {
      data = await request.json();
    } catch (e) {
      return jsonResponse({ success: false, message: 'Invalid request body' }, 400, origin);
    }

    // Honeypot check
    if (data._honeypot) {
      // Bot detected — fake success
      return jsonResponse({ success: true }, 200, origin);
    }

    // Validate Turnstile CAPTCHA
    var turnstileToken = data['cf-turnstile-response'];
    if (!turnstileToken) {
      return jsonResponse({ success: false, message: 'CAPTCHA verification required.' }, 400, origin);
    }

    var turnstileValid = await validateTurnstile(turnstileToken, ip, env.TURNSTILE_SECRET);
    if (!turnstileValid) {
      return jsonResponse({ success: false, message: 'CAPTCHA verification failed. Please try again.' }, 403, origin);
    }

    // Build email
    var formType = data.form_type || 'contact';
    var enquiryType = data.enquiry_type || '';
    var subject = enquiryType
      ? enquiryType + ' — The Well Church Website'
      : 'New ' + formType + ' — The Well Church Website';

    var htmlBody = buildEmailHtml(data);
    var rawMime = buildMimeMessage(subject, htmlBody);

    // Send via Cloudflare Email Workers
    try {
      var { EmailMessage } = await import('cloudflare:email');
      var allRecipients = [TO_ADDRESS].concat(CC_ADDRESSES);

      // Send to primary recipient
      var msg = new EmailMessage(FROM_ADDRESS, TO_ADDRESS, rawMime);
      await env.SEND_EMAIL.send(msg);

      return jsonResponse({ success: true }, 200, origin);
    } catch (err) {
      console.error('Email send failed:', err);
      return jsonResponse({ success: false, message: 'Failed to send message. Please try again.' }, 500, origin);
    }
  }
};
