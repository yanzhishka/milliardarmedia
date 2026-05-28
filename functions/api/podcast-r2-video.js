const R2_PODCAST_VIDEO_KEY_PREFIX = "podcasts/";

export async function onRequestGet({ request, env }) {
  if (!env.PODCASTS_R2) {
    return jsonResponse(
      { ok: false, error: "Missing Cloudflare R2 binding: PODCASTS_R2" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const videoKey = url.searchParams.get("key") || "";

  if (!isAllowedVideoKey(videoKey)) {
    return jsonResponse({ ok: false, error: "Invalid video key" }, { status: 400 });
  }

  const head = await env.PODCASTS_R2.head(videoKey);

  if (!head) {
    return jsonResponse({ ok: false, error: "Video not found" }, { status: 404 });
  }

  const range = parseRange(request.headers.get("Range"), head.size);
  const object = range
    ? await env.PODCASTS_R2.get(videoKey, {
        range: {
          offset: range.start,
          length: range.length,
        },
      })
    : await env.PODCASTS_R2.get(videoKey);

  if (!object) {
    return jsonResponse({ ok: false, error: "Video not found" }, { status: 404 });
  }

  const contentType =
    head.httpMetadata?.contentType ||
    head.customMetadata?.contentType ||
    object.httpMetadata?.contentType ||
    inferVideoContentType(videoKey);
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    "Content-Type": contentType,
    ...corsHeaders(),
  };

  if (range) {
    return new Response(object.body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${head.size}`,
      },
    });
  }

  return new Response(object.body, {
    headers: {
      ...headers,
      "Content-Length": String(head.size),
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
  const start = suffixLength ? Math.max(size - suffixLength, 0) : Number(match[1] || 0);
  const requestedEnd = suffixLength ? size - 1 : Number(match[2] || start + 8 * 1024 * 1024 - 1);
  const end = Math.min(requestedEnd, size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return null;
  }

  return {
    start,
    end,
    length: end - start + 1,
  };
}

function isAllowedVideoKey(videoKey) {
  return videoKey.startsWith(R2_PODCAST_VIDEO_KEY_PREFIX) && !videoKey.includes("..") && videoKey.length <= 240;
}

function inferVideoContentType(videoKey) {
  const path = String(videoKey).toLowerCase();

  if (path.endsWith(".webm")) {
    return "video/webm";
  }

  if (path.endsWith(".mov")) {
    return "video/quicktime";
  }

  if (path.endsWith(".mkv")) {
    return "video/x-matroska";
  }

  return "video/mp4";
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
