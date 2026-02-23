# The Well Church Reading — Website Design

**Date:** 2026-02-23
**Domain:** thewell-church.com (redirect from Hostinger DNS to GitHub Pages)
**Stack:** Jekyll + GitHub Pages + Facebook Graph API + Whisper + Lunr.js

## Church Info
- **Name:** The Well Church
- **Address:** Dawlish Road, Reading, RG2 7SD
- **Phone:** 0118 9755822
- **Email:** life@thewell-church.com
- **Facebook:** facebook.com/thewellreading
- **The Well Centre:** Social action arm, open to all regardless of background

## Architecture

```
GitHub Pages (free static hosting, HTTPS, CDN)
├── Jekyll SSG (native GH Pages support, zero build config)
├── Facebook Graph API → GitHub Actions (hourly cron)
│   ├── Posts → _data/facebook_posts.json
│   ├── Videos → _data/facebook_videos.json
│   ├── Events → _data/facebook_events.json
│   └── Photos → _data/facebook_photos.json
├── Hostinger Video Archive (50-200 videos, embedded on site)
├── Whisper Transcription Pipeline
│   └── _data/transcripts/{video-id}.json (timestamped segments)
├── Lunr.js Client-Side Search (indexes transcripts + posts + pages)
├── Prayer Request Form → Formspree → Pastor's email
└── Brand assets extracted from Facebook page
```

## Pages

1. **Home** — Hero + latest FB posts + live clips + prayer CTA + service times + map
2. **About Us** — Story, vision, leadership, photo gallery (from FB)
3. **Services** — Times, what to expect, plan your visit
4. **Sermons & Videos** — Searchable archive, video grid, filters, player + transcript
5. **Events Diary** — Calendar + list views, auto-pulled from FB + manual
6. **The Well Centre** — Programs, volunteering, how to get help
7. **Prayer Request** — Name + phone + request → pastor's email via Formspree
8. **Our Family** — Partner churches: D2W, Kharris Church, Well Ethiopian Church
9. **Kids & Youth** — Programs, times
10. **Small Groups** — Info, how to join
11. **Give / Donate** — Giving platform link
12. **Contact** — Address, phone, email, map, general form

## Search System

- Lunr.js indexes all video transcripts, FB posts, page content at build time
- Ships as assets/search-index.json (~500KB-1MB)
- Client-side instant search, no server needed
- Results show: title, text snippet, timestamp link for videos
- Search bar in navigation on every page

## Transcription Pipeline

1. **Batch:** Download 50-200 videos from Hostinger → Whisper → timestamped JSON
2. **Ongoing:** GH Action pulls new FB live streams → Whisper → commit transcripts
3. **Format:** `{video_id, title, duration, segments: [{start, end, text}], full_text}`
4. **Search:** "man broke his leg" → finds exact video + timestamp

## Prayer Request Form

- Fields: first name, phone (optional), prayer request
- Sends to pastor email via Formspree (free, 50/month)
- Warm confirmation: "We'll be praying for you, [name]"
- If phone provided: "Expect a call within 48 hours"
- Privacy: requests go only to pastor, never displayed publicly

## Facebook Auto-Sync

- GitHub Actions workflow runs hourly
- Calls Facebook Graph API with Page Access Token
- Writes posts/videos/events/photos to _data/*.json
- Jekyll rebuilds automatically on push
- Posts appear as native website cards, not embedded widgets

## Domain Setup

1. In Hostinger DNS panel, add:
   - A record: 185.199.108.153 (GitHub Pages)
   - A record: 185.199.109.153
   - A record: 185.199.110.153
   - A record: 185.199.111.153
   - CNAME: www → thewellreading.github.io
2. In repo: add CNAME file with `thewell-church.com`
3. GitHub Pages settings: enable custom domain + enforce HTTPS

## Visual Design

- Brand colours + logo extracted from Facebook page
- Typography: Inter (headings) + Source Sans 3 (body)
- Mobile-first, WCAG AAA accessible
- Full-width hero, card-based sections, generous whitespace
- No emojis as icons — SVG only (Lucide)

## Partner Churches

- Destined to Win (D2W)
- Kharris Church (youth church)
- The Well Ethiopian Church Reading

## Implementation Phases

### Phase 1: Foundation (immediate)
- GitHub repo + Jekyll structure
- All layouts, includes, SCSS
- All static pages with placeholder content
- Prayer request form (Formspree)
- Partner churches page
- Mobile responsive
- Deploy to GitHub Pages
- Point domain

### Phase 2: Facebook Auto-Sync (needs FB App token)
- Create Facebook App in Meta Developer portal
- fetch-facebook.py script
- GitHub Actions hourly cron
- Post/video/event card templates
- Homepage auto-populated

### Phase 3: Video Archive + Transcription (needs Hostinger video access)
- Get video URLs from Hostinger
- Batch transcribe with Whisper
- Video archive page with grid + filters
- Video player page with transcript panel
- Timestamp linking

### Phase 4: Search
- Build Lunr.js search index
- Search bar in nav
- Search results page
- Auto-rebuild on new content

### Phase 5: Events Diary
- Calendar + list views
- FB events auto-pull
- Manual event creation via markdown

## Competitors Beaten

| Feature | Greyfriars | LifeSpring | The Well (ours) |
|---|---|---|---|
| Speed | Slow (WordPress) | Average (WordPress) | Sub-1s (static CDN) |
| Content freshness | Manual weekly | Manual occasional | Auto hourly from FB |
| Video search | None | None | Full transcript search |
| Prayer callback | Hidden form | None | Featured + phone callback |
| Mobile | Slow | Average | Phone-first design |
| Cost | Hosting fees | Hosting fees | Free (GitHub Pages) |
