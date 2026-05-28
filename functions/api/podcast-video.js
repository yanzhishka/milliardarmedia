const PODCAST_VIDEO_KEY_PREFIX = "telegram_podcast_video:";

export async function onRequestGet({ request, env }) {
  if (!env.POSTS_KV) {
    return jsonResponse(
      { ok: false, error: "Missing Cloudflare KV binding: POSTS_KV" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const videoKey = url.searchParams.get("key") || "";

  if (!isAllowedVideoKey(videoKey)) {
    return jsonResponse({ ok: false, error: "Invalid video key" }, { status: 400 });
  }

  const video = await readVideo(env, videoKey);

  if (!video.value) {
    return jsonResponse({ ok: false, error: "Video not found" }, { status: 404 });
  }

  const contentType = video.metadata?.contentType || "video/mp4";
  const range = request.headers.get("Range");

  if (range) {
    return rangeResponse(video.value, range, contentType);
  }

  return new Response(video.value, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(video.value.byteLength),
      "Content-Type": contentType,
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

async function readVideo(env, videoKey) {
  if (typeof env.POSTS_KV.getWithMetadata === "function") {
    return env.POSTS_KV.getWithMetadata(videoKey, { type: "arrayBuffer" });
  }

  return {
    value: await env.POSTS_KV.get(videoKey, { type: "arrayBuffer" }),
    metadata: null,
  };
}

function isAllowedVideoKey(videoKey) {
  return videoKey.startsWith(PODCAST_VIDEO_KEY_PREFIX) && videoKey.length <= 190;
}

function rangeResponse(videoBytes, rangeHeader, contentType) {
  const size = videoBytes.byteLength;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        ...corsHeaders(),
      },
    });
  }

  const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
  const start = suffixLength ? Math.max(size - suffixLength, 0) : Number(match[1] || 0);
  const end = suffixLength ? size - 1 : Number(match[2] || size - 1);

  if (start >= size || end >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        ...corsHeaders(),
      },
    });
  }

  const chunk = videoBytes.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Type": contentType,
      ...corsHeaders(),
    },
  });
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
    "Access-Control-Allow-Headers": "Content-Type, Range",
  };
}
