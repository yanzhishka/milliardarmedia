const POSTS_KEY = "telegram_posts";

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

  return Array.isArray(posts) ? posts : [];
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
