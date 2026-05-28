const PODCASTS_KEY = "telegram_podcasts";

export async function onRequestGet({ env }) {
  const podcasts = await readPodcasts(env);

  return jsonResponse({
    ok: true,
    podcasts,
    updatedAt: new Date().toISOString(),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readPodcasts(env) {
  if (!env.POSTS_KV) {
    return [];
  }

  const podcasts = await env.POSTS_KV.get(PODCASTS_KEY, { type: "json" });

  return Array.isArray(podcasts) ? filterVisiblePodcasts(podcasts, env) : [];
}

function filterVisiblePodcasts(podcasts, env) {
  const resetAt = Number(env.TELEGRAM_PODCAST_RESET_AT || 0) || 0;

  return podcasts.filter((podcast) => Number(podcast.date || 0) >= resetAt);
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...init.headers,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
