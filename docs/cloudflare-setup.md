# Cloudflare Setup — DNS Migration, Worker Deploy, Facebook App

## 1. DNS Migration (Hostinger → Cloudflare)

1. Create free Cloudflare account at https://dash.cloudflare.com/sign-up
2. Click **Add a site** → enter `thewell-church.com`
3. Select the **Free** plan
4. Cloudflare scans existing DNS — verify these records appear:

   | Type  | Name | Content              |
   |-------|------|----------------------|
   | A     | @    | 185.199.108.153      |
   | A     | @    | 185.199.109.153      |
   | A     | @    | 185.199.110.153      |
   | A     | @    | 185.199.111.153      |
   | CNAME | www  | thewell-church.com   |

   Also keep any MX/TXT records for email (see section 4).

5. Cloudflare gives you 2 nameservers (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
6. Log into **Hostinger** → Domains → `thewell-church.com` → DNS/Nameservers
7. Change nameservers from Hostinger's (`ns1.dns-parking.com`, `ns2.dns-parking.com`) to the 2 Cloudflare gave you
8. Wait for propagation (usually <1 hour, max 48h)
9. In Cloudflare dashboard: **SSL/TLS** → set to **Full** (GitHub Pages has its own cert)
10. Verify: `curl -I https://thewell-church.com` → should show a `cf-ray` header

## 2. Worker Deployment

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
cd workers/live-status
wrangler kv:namespace create LIVE_KV
# Copy the ID from output into wrangler.toml (replace REPLACE_WITH_KV_NAMESPACE_ID)

# Set secrets
wrangler secret put VERIFY_TOKEN
# Enter a random string — you'll use the same one in Facebook App setup

wrangler secret put APP_SECRET
# Enter your Facebook App Secret (from developers.facebook.com → App Settings → Basic)

# Deploy
wrangler deploy
```

After deploy, add the Worker Route in Cloudflare dashboard:
- Go to **Workers & Pages** → **live-status** → **Settings** → **Triggers**
- Add route: `thewell-church.com/api/live-status*`

Or uncomment the `routes` line in `wrangler.toml` and redeploy.

## 3. Facebook App Setup

1. Go to https://developers.facebook.com → **Create App** → **Business** type
2. Add the **Webhooks** product
3. Go to **Webhooks** → **Page** → click **Subscribe to this object**
4. Subscribe to field: `live_videos`
5. Callback URL: `https://thewell-church.com/api/live-status`
6. Verify token: the same `VERIFY_TOKEN` secret from step 2
7. Click **Verify and Save** — Facebook sends a GET with `hub.challenge`, the Worker responds
8. Under **Page subscriptions**, select The Well Church page
9. Add a page admin as test user (the app works in dev mode, no App Review needed for your own page)

### Optional: Long-lived Page Token (for future YouTube archival)

```
GET /me/accounts?access_token=USER_TOKEN
```
Use the page access token from the response — it's long-lived by default for system users.

## 4. Email — Drop Hostinger, Use Cloudflare Email Routing + Gmail

This replaces Hostinger email entirely. Rod (and anyone else) will send and receive
`@thewell-church.com` email through their personal Gmail — for free.

### 4a. Capture existing DNS records BEFORE migration

```bash
dig thewell-church.com MX +short
dig thewell-church.com TXT +short
```

Save these in case you need to roll back.

### 4b. Enable Cloudflare Email Routing (receiving)

1. In Cloudflare dashboard → **Email** → **Email Routing** → **Get started**
2. Add a routing rule:
   - Custom address: `rod@thewell-church.com`
   - Forward to: Rod's personal Gmail (e.g. `rod@gmail.com`)
3. Rod will receive a verification email at his Gmail — click the link
4. Add a catch-all rule (optional): forward `*@thewell-church.com` → Rod's Gmail
5. Cloudflare auto-creates the required MX and TXT records — **delete any old Hostinger MX records**

### 4c. Configure Gmail "Send As" (sending from @thewell-church.com)

This lets Rod compose emails in Gmail that appear to come from `rod@thewell-church.com`.

1. **Enable 2-Step Verification** on Rod's Google Account (required for App Passwords)
   - Go to https://myaccount.google.com/security → 2-Step Verification → Turn on
2. **Create an App Password**
   - Go to https://myaccount.google.com/apppasswords
   - App name: `The Well Church Email`
   - Copy the 16-character password (shown once)
3. **Add "Send As" in Gmail**
   - Gmail → Settings (gear) → **See all settings** → **Accounts and Import**
   - Under "Send mail as" → click **Add another email address**
   - Name: `Rod` (or whatever name should appear)
   - Email: `rod@thewell-church.com`
   - Uncheck "Treat as an alias" → **Next**
   - SMTP Server: `smtp.gmail.com`
   - Port: `587`
   - Username: Rod's full Gmail address (e.g. `rod@gmail.com`)
   - Password: the App Password from step 2
   - Select **Secured connection using TLS**
   - Click **Add Account**
4. Gmail sends a confirmation code to `rod@thewell-church.com` — since routing is already set up, it arrives in Rod's Gmail. Enter the code.
5. Optionally: set `rod@thewell-church.com` as the **default** send-from address

### 4d. DNS records for deliverability

In Cloudflare DNS, ensure these TXT records exist:

| Type | Name | Content |
|------|------|---------|
| TXT  | @    | `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all` |
| TXT  | _dmarc | `v=DMARC1; p=none; rua=mailto:rod@thewell-church.com` |

The SPF record authorises both Cloudflare (receiving) and Google (sending) to handle
mail for your domain. DMARC starts in monitor mode (`p=none`) — tighten to `p=quarantine`
after a few weeks of clean reports.

### 4e. Test email

1. From Gmail, compose an email **from** `rod@thewell-church.com` to a different address (e.g. a friend's email)
2. Ask them to reply — verify the reply arrives in Rod's Gmail
3. Check the email headers: should show `spf=pass`

### Long-term: Google Workspace for Nonprofits (free)

If The Well Church is a **registered UK charity**, you qualify for free Google Workspace:

1. Register at https://www.charitydigital.org.uk/ with your Charity Commission number
2. Apply for Google for Nonprofits through Charity Digital
3. Activate Google Workspace — gives full `@thewell-church.com` Gmail with DKIM, shared Drive, Calendar, Meet
4. Also unlocks Google Ad Grants ($10k/month free Google Ads)

This is the best permanent solution. Cloudflare Email Routing works perfectly as a bridge until approval (2-4 weeks).

## 5. Verification Checklist

- [ ] `curl -I https://thewell-church.com` shows `cf-ray` header
- [ ] `curl https://thewell-church.com/api/live-status` returns `{"is_live":false,...}`
- [ ] Site loads normally (all pages, images, CSS)
- [ ] Send test email from `rod@thewell-church.com` via Gmail — recipient receives it
- [ ] Reply to that email — arrives in Rod's Gmail
- [ ] Check email headers show `spf=pass`
- [ ] SSL certificate valid (no browser warnings)
