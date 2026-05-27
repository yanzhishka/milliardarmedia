const POSTS_KEY = "telegram_posts";
const MAX_POSTS = 30;

export async function onRequestPost({ request, env }) {
  if (!env.POSTS_KV) {
    return jsonResponse(
      { ok: false, error: "Missing Cloudflare KV binding: POSTS_KV" },
      { status: 500 },
    );
  }

  if (!isValidTelegramSecret(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized webhook" }, { status: 401 });
  }

  let update;

  try {
    update = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = update.channel_post || update.edited_channel_post;

  if (!message) {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!isAllowedChannel(message.chat, env)) {
    return jsonResponse({ ok: true, ignored: true, reason: "channel_mismatch" });
  }

  const post = normalizePost(message);
  const posts = await readPosts(env);
  const nextPosts = upsertPost(posts, post);

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));

  return jsonResponse({ ok: true, stored: post.id });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readPosts(env) {
  const posts = await env.POSTS_KV.get(POSTS_KEY, { type: "json" });

  return Array.isArray(posts) ? posts : [];
}

function isValidTelegramSecret(request, env) {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return false;
  }

  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === expectedSecret;
}

function isAllowedChannel(chat, env) {
  if (!chat) {
    return false;
  }

  if (env.TELEGRAM_CHANNEL_ID && String(chat.id) !== String(env.TELEGRAM_CHANNEL_ID)) {
    return false;
  }

  if (env.TELEGRAM_CHANNEL_USERNAME) {
    const expectedUsername = normalizeUsername(env.TELEGRAM_CHANNEL_USERNAME);
    const actualUsername = normalizeUsername(chat.username || "");

    if (actualUsername !== expectedUsername) {
      return false;
    }
  }

  return true;
}

function normalizePost(message) {
  const chat = message.chat || {};
  const text = message.text || message.caption || "";
  const username = chat.username || "";

  return {
    id: `${chat.id}:${message.message_id}`,
    messageId: message.message_id,
    chatId: chat.id,
    chatTitle: chat.title || "",
    chatUsername: username,
    date: message.date || Math.floor(Date.now() / 1000),
    editedDate: message.edit_date || null,
    text: text.trim().slice(0, 1400),
    link: username ? `https://t.me/${username}/${message.message_id}` : "",
    mediaType: detectMediaType(message),
    receivedAt: new Date().toISOString(),
  };
}

function detectMediaType(message) {
  if (message.photo) {
    return "photo";
  }

  if (message.video) {
    return "video";
  }

  if (message.animation) {
    return "animation";
  }

  if (message.document) {
    return "document";
  }

  return "text";
}

function upsertPost(posts, post) {
  const withoutCurrent = posts.filter((item) => item.id !== post.id);

  return [post, ...withoutCurrent]
    .sort((left, right) => (right.date || 0) - (left.date || 0))
    .slice(0, MAX_POSTS);
}

function normalizeUsername(username) {
  return String(username).replace(/^@/, "").trim().toLowerCase();
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
  };
}
