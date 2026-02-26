/**
 * Google Reviews Worker — The Well Church
 *
 * Proxies Google Places API to fetch reviews, caches in KV for 24 hours.
 * The API key stays server-side — never exposed to clients.
 *
 * Deploy: cd workers/google-reviews && wrangler deploy
 * Secrets needed (set via wrangler secret put):
 *   GOOGLE_API_KEY — Google Places API key
 */

const CACHE_KEY = 'google-reviews';
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
const SEARCH_QUERY = 'The Well Church Dawlish Road Reading';
const PLACE_ID_KEY = 'place-id';

const ALLOWED_ORIGINS = [
  'https://thewell-church.com',
  'https://www.thewell-church.com',
  'https://thewell-church.pages.dev'
];

function corsHeaders(origin) {
  var allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1;
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600'
  };
}

// Find Place ID using text search (called once, then cached in KV)
async function findPlaceId(apiKey) {
  var url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
    + '?input=' + encodeURIComponent(SEARCH_QUERY)
    + '&inputtype=textquery'
    + '&fields=place_id'
    + '&key=' + apiKey;
  var resp = await fetch(url);
  var data = await resp.json();
  if (data.candidates && data.candidates.length > 0) {
    return data.candidates[0].place_id;
  }
  return null;
}

// Fetch place details including reviews
async function fetchReviews(placeId, apiKey) {
  var url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + '?place_id=' + encodeURIComponent(placeId)
    + '&fields=name,rating,user_ratings_total,reviews,url'
    + '&reviews_sort=newest'
    + '&key=' + apiKey;
  var resp = await fetch(url);
  var data = await resp.json();
  if (data.result) {
    var reviews = (data.result.reviews || []).map(function (r) {
      return {
        author: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.relative_time_description,
        photo: r.profile_photo_url || null
      };
    });
    return {
      name: data.result.name,
      rating: data.result.rating,
      total_reviews: data.result.user_ratings_total,
      maps_url: data.result.url,
      reviews: reviews,
      cached_at: new Date().toISOString()
    };
  }
  return null;
}

export default {
  async fetch(request, env) {
    var origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
      });
    }

    // Check KV cache first
    var cached = await env.REVIEWS_KV.get(CACHE_KEY, 'json');
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
      });
    }

    // Resolve Place ID (from env var or auto-discover)
    var placeId = env.PLACE_ID || null;
    if (!placeId) {
      placeId = await env.REVIEWS_KV.get(PLACE_ID_KEY);
    }
    if (!placeId) {
      placeId = await findPlaceId(env.GOOGLE_API_KEY);
      if (placeId) {
        await env.REVIEWS_KV.put(PLACE_ID_KEY, placeId);
      }
    }

    if (!placeId) {
      return new Response(JSON.stringify({ error: 'Could not find place' }), {
        status: 500,
        headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
      });
    }

    // Fetch fresh reviews
    var result = await fetchReviews(placeId, env.GOOGLE_API_KEY);
    if (!result) {
      return new Response(JSON.stringify({ error: 'Failed to fetch reviews' }), {
        status: 502,
        headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
      });
    }

    // Cache in KV for 24 hours
    await env.REVIEWS_KV.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });

    return new Response(JSON.stringify(result), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
    });
  }
};
