const IMAGE_KEY_PREFIX = "telegram_post_image:";

export async function onRequestGet({ request, env }) {
  if (!env.POSTS_KV) {
    return jsonResponse(
      { ok: false, error: "Missing Cloudflare KV binding: POSTS_KV" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const imageKey = url.searchParams.get("key") || "";

  if (!isAllowedImageKey(imageKey)) {
    return jsonResponse({ ok: false, error: "Invalid image key" }, { status: 400 });
  }

  const image = await readImage(env, imageKey);

  if (!image.value) {
    return jsonResponse({ ok: false, error: "Image not found" }, { status: 404 });
  }

  return new Response(image.value, {
    headers: {
      "Content-Type": image.metadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ...corsHeaders(),
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readImage(env, imageKey) {
  if (typeof env.POSTS_KV.getWithMetadata === "function") {
    return env.POSTS_KV.getWithMetadata(imageKey, { type: "arrayBuffer" });
  }

  return {
    value: await env.POSTS_KV.get(imageKey, { type: "arrayBuffer" }),
    metadata: null,
  };
}

function isAllowedImageKey(imageKey) {
  return imageKey.startsWith(IMAGE_KEY_PREFIX) && imageKey.length <= 180;
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
