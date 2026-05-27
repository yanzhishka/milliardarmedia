const POSTS_KEY = "telegram_posts";
const DEFAULT_FEED_RESET_AT = 1779912679;

export async function onRequestGet({ env }) {
  const posts = await readPosts(env);

  return jsonResponse({
    ok: true,
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readPosts(env) {
  if (!env.POSTS_KV) {
    return [];
  }

  const posts = await env.POSTS_KV.get(POSTS_KEY, { type: "json" });

  return Array.isArray(posts) ? filterVisiblePosts(posts, env) : [];
}

function filterVisiblePosts(posts, env) {
  const resetAt = getFeedResetAt(env);

  return posts.filter((post) => Number(post.date || 0) >= resetAt);
}

function getFeedResetAt(env) {
  return Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
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
