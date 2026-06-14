const POSTS_KEY = "telegram_posts";
const DEFAULT_FEED_RESET_AT = 1779913144;
const MAX_POSTS = 90;

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

  return Array.isArray(posts) ? collapsePostAlbums(filterVisiblePosts(posts, env)) : [];
}

function filterVisiblePosts(posts, env) {
  const resetAt = getFeedResetAt(env);

  return posts.filter((post) => Number(post.date || 0) >= resetAt);
}

function collapsePostAlbums(posts) {
  const albumGroups = new Map();
  const legacyGroups = new Map();
  const singles = [];

  posts.forEach((post) => {
    if (post.mediaGroupId) {
      appendToGroup(albumGroups, `${post.chatId}:album:${post.mediaGroupId}`, post);
      return;
    }

    if (isPhotoPost(post) && Number(post.date || 0)) {
      appendToGroup(legacyGroups, `${post.chatId}:legacy:${post.date}`, post);
      return;
    }

    singles.push(post);
  });

  const mergedAlbums = [...albumGroups.values()].map((group) => mergePostGroup(group));
  const mergedLegacyPosts = [...legacyGroups.values()].flatMap((group) => {
    if (group.length > 1 && group.some(isEmptyPost)) {
      return [mergePostGroup(group)];
    }

    return group;
  });

  return [...singles, ...mergedAlbums, ...mergedLegacyPosts]
    .sort(comparePosts)
    .slice(0, MAX_POSTS);
}

function appendToGroup(groups, key, post) {
  const group = groups.get(key) || [];

  group.push(post);
  groups.set(key, group);
}

function mergePostGroup(group) {
  const sortedGroup = [...group].sort(comparePostsByMessageId);
  const textSource = sortedGroup.find(hasPostText) || sortedGroup[0];
  const images = uniqueImages(sortedGroup.flatMap(collectPostImages)).sort(compareImages);
  const firstImage = images[0] || null;
  const messageIds = [
    ...new Set(sortedGroup.flatMap((post) => post.messageIds || [post.messageId]).filter(Boolean)),
  ].sort((left, right) => Number(left) - Number(right));

  return {
    ...textSource,
    id: textSource.mediaGroupId
      ? `${textSource.chatId}:album:${textSource.mediaGroupId}`
      : textSource.id,
    messageId: textSource.messageId || messageIds[0] || null,
    messageIds,
    date: Math.max(...sortedGroup.map((post) => Number(post.date || 0))),
    editedDate: Math.max(...sortedGroup.map((post) => Number(post.editedDate || 0))) || null,
    text: String(textSource.text || "").trim(),
    link: textSource.link || sortedGroup.find((post) => post.link)?.link || "",
    mediaType: images.length ? "photo" : textSource.mediaType,
    images,
    imageUrl: textSource.imageUrl || firstImage?.url || "",
    imageKey: textSource.imageKey || firstImage?.key || "",
    imageStatus: firstImage ? "saved" : textSource.imageStatus || "none",
    imageError: textSource.imageError || "",
    imageWidth: textSource.imageWidth || firstImage?.width || null,
    imageHeight: textSource.imageHeight || firstImage?.height || null,
  };
}

function collectPostImages(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  const normalizedImages = images
    .map((image) => normalizePostImage(image, post))
    .filter((image) => image.url || image.key);

  if (post.imageUrl || post.imageKey) {
    normalizedImages.push(normalizePostImage({
      url: post.imageUrl,
      key: post.imageKey,
      width: post.imageWidth,
      height: post.imageHeight,
      messageId: post.messageId,
    }, post));
  }

  return normalizedImages;
}

function normalizePostImage(image, post) {
  return {
    url: image.url || "",
    key: image.key || "",
    width: image.width || null,
    height: image.height || null,
    messageId: image.messageId || post.messageId || null,
  };
}

function uniqueImages(images) {
  const seen = new Set();

  return images.filter((image) => {
    const key = image.key || image.url;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function comparePosts(left, right) {
  const dateDelta = Number(right.date || 0) - Number(left.date || 0);

  if (dateDelta) {
    return dateDelta;
  }

  return Number(right.messageId || 0) - Number(left.messageId || 0);
}

function comparePostsByMessageId(left, right) {
  return Number(left.messageId || 0) - Number(right.messageId || 0);
}

function compareImages(left, right) {
  return Number(left.messageId || 0) - Number(right.messageId || 0);
}

function hasPostText(post) {
  return Boolean(String(post?.text || post?.caption || "").trim());
}

function isEmptyPost(post) {
  return !hasPostText(post);
}

function isPhotoPost(post) {
  return post?.mediaType === "photo" || Boolean(post?.imageUrl || post?.imageKey);
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
