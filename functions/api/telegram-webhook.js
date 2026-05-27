const POSTS_KEY = "telegram_posts";
const IMAGE_KEY_PREFIX = "telegram_post_image:";
const MAX_POSTS = 30;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_FEED_RESET_AT = 1779913144;

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

  if (update.message) {
    return handleBotMessage(update.message, env);
  }

  const channelPost = update.channel_post || update.edited_channel_post;

  if (!channelPost) {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!isAllowedChannel(channelPost.chat, env)) {
    return jsonResponse({ ok: true, ignored: true, reason: "channel_mismatch" });
  }

  const posts = await readPosts(env);
  const previousPost = findPost(posts, channelPost);
  const post = await normalizePost(channelPost, env);
  const nextPosts = upsertPost(posts, post);
  const stalePosts = collectStaleImagePosts(posts, nextPosts, previousPost, post);

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));
  await deletePostImages(env, stalePosts);

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

  return Array.isArray(posts) ? filterVisiblePosts(posts, env) : [];
}

async function handleBotMessage(message, env) {
  const text = (message.text || "").trim();

  if (isCommand(text, "whoami")) {
    await replyToBotMessage(env, message, `Ваш Telegram ID: ${message.from?.id || "неизвестен"}`);
    return jsonResponse({ ok: true, command: "whoami" });
  }

  if (!isCommand(text, "delete")) {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!isAdminMessage(message, env)) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам ленты.");
    return jsonResponse({ ok: true, command: "delete", denied: true });
  }

  const posts = await readPosts(env);
  const deleteTarget = parseDeleteTarget(text);
  let messageId = deleteTarget.messageId;

  if (!deleteTarget.raw && posts.length) {
    messageId = posts[0].messageId;
  }

  if (!deleteTarget.raw && !posts.length) {
    await replyToBotMessage(env, message, "В ленте сайта пока нет постов.");
    return jsonResponse({ ok: true, command: "delete", empty: true });
  }

  if (deleteTarget.raw && !messageId) {
    await replyToBotMessage(
      env,
      message,
      "Формат: /delete, /delete 123 или /delete https://t.me/milliardarmedia/123",
    );
    return jsonResponse({ ok: true, command: "delete", error: "missing_message_id" });
  }

  const chatId = getChannelChatId(env);
  const telegramResult = chatId
    ? await callTelegram(env, "deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      })
    : { ok: false, description: "TELEGRAM_CHANNEL_ID или TELEGRAM_CHANNEL_USERNAME не настроен" };

  const nextPosts = removePost(posts, messageId);
  const deletedPosts = posts.filter((post) => !nextPosts.some((nextPost) => nextPost.id === post.id));

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));
  await deletePostImages(env, deletedPosts);
  await replyToBotMessage(env, message, buildDeleteReply(messageId, telegramResult, posts, nextPosts));

  return jsonResponse({
    ok: true,
    command: "delete",
    messageId,
    telegramDeleted: telegramResult.ok,
    siteDeleted: posts.length !== nextPosts.length,
  });
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

function isCommand(text, command) {
  return new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`, "i").test(text);
}

function isAdminMessage(message, env) {
  const adminIds = String(env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminIds.length) {
    return false;
  }

  return adminIds.includes(String(message.from?.id || ""));
}

function parseDeleteTarget(text) {
  const target = text.replace(/^\/delete(?:@\w+)?/i, "").trim();

  if (!target) {
    return {
      raw: "",
      messageId: null,
    };
  }

  if (/^\d+$/.test(target)) {
    return {
      raw: target,
      messageId: Number(target),
    };
  }

  const match = target.match(/\/(\d+)(?:\?.*)?$/);

  return {
    raw: target,
    messageId: match ? Number(match[1]) : null,
  };
}

function getChannelChatId(env) {
  if (env.TELEGRAM_CHANNEL_ID) {
    return env.TELEGRAM_CHANNEL_ID;
  }

  if (env.TELEGRAM_CHANNEL_USERNAME) {
    return `@${normalizeUsername(env.TELEGRAM_CHANNEL_USERNAME)}`;
  }

  return "";
}

async function normalizePost(message, env) {
  const chat = message.chat || {};
  const text = message.text || message.caption || "";
  const username = chat.username || "";
  const postId = `${chat.id}:${message.message_id}`;
  const photo = pickPhoto(message.photo);
  const image = photo ? await saveTelegramPhoto(env, postId, photo) : null;

  return {
    id: postId,
    messageId: message.message_id,
    chatId: chat.id,
    chatTitle: chat.title || "",
    chatUsername: username,
    date: message.date || Math.floor(Date.now() / 1000),
    editedDate: message.edit_date || null,
    text: text.trim().slice(0, 1400),
    link: username ? `https://t.me/${username}/${message.message_id}` : "",
    mediaType: detectMediaType(message),
    imageUrl: image?.url || "",
    imageKey: image?.key || "",
    imageWidth: photo?.width || null,
    imageHeight: photo?.height || null,
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

function findPost(posts, message) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;

  return posts.find((post) => String(post.id) === `${chatId}:${messageId}`) || null;
}

function collectStaleImagePosts(posts, nextPosts, previousPost, nextPost) {
  const nextIds = new Set(nextPosts.map((post) => post.id));
  const removedPosts = posts.filter((post) => !nextIds.has(post.id));

  if (previousPost?.imageKey && previousPost.imageKey !== nextPost.imageKey) {
    removedPosts.push(previousPost);
  }

  return removedPosts;
}

function pickPhoto(photos = []) {
  if (!Array.isArray(photos) || !photos.length) {
    return null;
  }

  const sorted = [...photos].sort((left, right) => {
    const leftPixels = Number(left.width || 0) * Number(left.height || 0);
    const rightPixels = Number(right.width || 0) * Number(right.height || 0);

    return rightPixels - leftPixels;
  });

  return sorted.find((photo) => Number(photo.file_size || 0) <= MAX_IMAGE_BYTES) || sorted.at(-1);
}

async function saveTelegramPhoto(env, postId, photo) {
  if (!photo?.file_id || !env.TELEGRAM_BOT_TOKEN) {
    return null;
  }

  const file = await callTelegram(env, "getFile", {
    file_id: photo.file_id,
  });

  if (!file.ok || !file.result?.file_path) {
    return null;
  }

  const fileResponse = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`,
  );

  if (!fileResponse.ok) {
    return null;
  }

  const imageBytes = await fileResponse.arrayBuffer();

  if (!imageBytes.byteLength || imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }

  const imageKey = `${IMAGE_KEY_PREFIX}${postId}`;
  const contentType =
    fileResponse.headers.get("Content-Type") || inferImageContentType(file.result.file_path);

  await env.POSTS_KV.put(imageKey, imageBytes, {
    metadata: {
      contentType,
      filePath: file.result.file_path,
      width: photo.width || null,
      height: photo.height || null,
    },
  });

  return {
    key: imageKey,
    url: `/api/post-image?key=${encodeURIComponent(imageKey)}`,
  };
}

function inferImageContentType(filePath = "") {
  const path = String(filePath).toLowerCase();

  if (path.endsWith(".png")) {
    return "image/png";
  }

  if (path.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

async function deletePostImages(env, posts) {
  const imageKeys = [...new Set(posts.map((post) => post.imageKey).filter(Boolean))];

  await Promise.all(imageKeys.map((imageKey) => env.POSTS_KV.delete(imageKey).catch(() => {})));
}

function filterVisiblePosts(posts, env) {
  const resetAt = getFeedResetAt(env);

  return posts.filter((post) => Number(post.date || 0) >= resetAt);
}

function getFeedResetAt(env) {
  return Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
}

function removePost(posts, messageId) {
  return posts.filter((post) => {
    if (Number(post.messageId) === Number(messageId)) {
      return false;
    }

    return !String(post.link || "").match(new RegExp(`/${messageId}(?:\\?.*)?$`));
  });
}

function normalizeUsername(username) {
  return String(username).replace(/^@/, "").trim().toLowerCase();
}

async function replyToBotMessage(env, message, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !message.chat?.id) {
    return;
  }

  await callTelegram(env, "sendMessage", {
    chat_id: message.chat.id,
    text,
    reply_to_message_id: message.message_id,
  });
}

async function callTelegram(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN не настроен" };
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      description: data.description || `Telegram API error ${response.status}`,
    };
  }

  return data;
}

function buildDeleteReply(messageId, telegramResult, oldPosts, nextPosts) {
  const telegramLine = telegramResult.ok
    ? "в Telegram удалён"
    : `Telegram не удалил: ${telegramResult.description}`;
  const siteLine = oldPosts.length !== nextPosts.length ? "из ленты сайта удалён" : "в ленте сайта уже не найден";

  return `Пост ${messageId}: ${telegramLine}; ${siteLine}.`;
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
