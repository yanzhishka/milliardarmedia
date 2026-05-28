const PODCASTS_KEY = "telegram_podcasts";
const PODCAST_UPLOAD_SESSION_KEY_PREFIX = "telegram_podcast_upload:";
const R2_PODCAST_VIDEO_KEY_PREFIX = "podcasts/";
const MAX_PODCASTS = 24;
const DEFAULT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const PRESIGNED_UPLOAD_TTL_SECONDS = 60 * 60;

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get("token") || "";

  if (!isValidToken(token)) {
    return jsonResponse({ ok: false, error: "Invalid upload token" }, { status: 400 });
  }

  const session = await readUploadSession(env, token);

  if (!session) {
    return jsonResponse({ ok: false, error: "Upload link expired" }, { status: 404 });
  }

  return jsonResponse({
    ok: true,
    session: publicSession(session, env),
  });
}

export async function onRequestPost({ request, env }) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body.token || "");

  if (!isValidToken(token)) {
    return jsonResponse({ ok: false, error: "Invalid upload token" }, { status: 400 });
  }

  const session = await readUploadSession(env, token);

  if (!session) {
    return jsonResponse({ ok: false, error: "Upload link expired" }, { status: 404 });
  }

  if (session.status === "completed") {
    return jsonResponse({ ok: false, error: "This upload link was already used" }, { status: 409 });
  }

  if (body.action === "prepare") {
    return prepareUpload(env, session, body);
  }

  if (body.action === "complete") {
    return completeUpload(env, session);
  }

  return jsonResponse({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function prepareUpload(env, session, body) {
  const r2Config = getR2Config(env);

  if (!env.POSTS_KV || !r2Config) {
    return jsonResponse(
      { ok: false, error: "R2 upload is not configured" },
      { status: 500 },
    );
  }

  const size = Number(body.size || 0);
  const maxBytes = getMaxUploadBytes(env);
  const contentType = normalizeVideoContentType(body.contentType);
  const fileName = String(body.fileName || "podcast.mp4").slice(0, 180);

  if (!contentType) {
    return jsonResponse({ ok: false, error: "Only video files are allowed" }, { status: 400 });
  }

  if (!Number.isFinite(size) || size <= 0) {
    return jsonResponse({ ok: false, error: "File size is unknown" }, { status: 400 });
  }

  if (size > maxBytes) {
    return jsonResponse(
      { ok: false, error: `File is larger than ${formatBytes(maxBytes)}` },
      { status: 413 },
    );
  }

  const objectKey = session.objectKey || createPodcastObjectKey(session, fileName, contentType);
  const uploadUrl = await createPresignedPutUrl({
    ...r2Config,
    key: objectKey,
    contentType,
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
  });
  const nextSession = {
    ...session,
    status: "prepared",
    objectKey,
    contentType,
    fileName,
    size,
    preparedAt: Date.now(),
  };

  await writeUploadSession(env, nextSession);

  return jsonResponse({
    ok: true,
    uploadUrl,
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    objectKey,
  });
}

async function completeUpload(env, session) {
  if (!env.POSTS_KV || !env.PODCASTS_R2) {
    return jsonResponse(
      { ok: false, error: "R2 bucket binding is not configured" },
      { status: 500 },
    );
  }

  if (!session.objectKey || !isAllowedR2Key(session.objectKey)) {
    return jsonResponse({ ok: false, error: "Upload was not prepared" }, { status: 400 });
  }

  const object = await env.PODCASTS_R2.head(session.objectKey);

  if (!object) {
    return jsonResponse({ ok: false, error: "Video is not visible in R2 yet" }, { status: 404 });
  }

  const podcast = buildR2Podcast(session, object);
  const podcasts = await readPodcasts(env);
  const nextPodcasts = upsertPodcast(podcasts, podcast);
  const completedSession = {
    ...session,
    status: "completed",
    completedAt: Date.now(),
    podcastId: podcast.id,
  };

  await env.POSTS_KV.put(PODCASTS_KEY, JSON.stringify(nextPodcasts));
  await writeUploadSession(env, completedSession, 60 * 60);
  await notifyTelegramUploadComplete(env, session, podcast);

  return jsonResponse({
    ok: true,
    podcast,
  });
}

function buildR2Podcast(session, object) {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: `r2:${session.token}`,
    messageId: session.createdAt || Date.now(),
    chatId: session.chatId || null,
    chatTitle: "",
    chatUsername: "",
    authorId: session.authorId || null,
    authorName: session.authorName || "",
    date: now,
    editedDate: null,
    title: session.title || "Недельный выпуск",
    description: session.description || "",
    text: session.description || "",
    link: "",
    mediaType: "video",
    videoUrl: `/api/podcast-r2-video?key=${encodeURIComponent(session.objectKey)}`,
    videoKey: session.objectKey,
    videoStorage: "r2",
    videoStatus: "saved",
    videoError: "",
    videoSize: object.size || session.size || null,
    videoDuration: null,
    videoWidth: null,
    videoHeight: null,
    receivedAt: new Date().toISOString(),
  };
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

function upsertPodcast(podcasts, podcast) {
  const withoutCurrent = podcasts.filter((item) => item.id !== podcast.id);

  return [podcast, ...withoutCurrent]
    .sort((left, right) => (right.date || 0) - (left.date || 0))
    .slice(0, MAX_PODCASTS);
}

async function readUploadSession(env, token) {
  if (!env.POSTS_KV) {
    return null;
  }

  const session = await env.POSTS_KV.get(getUploadSessionKey(token), { type: "json" });

  if (!session) {
    return null;
  }

  if (Number(session.expiresAt || 0) < Date.now()) {
    await env.POSTS_KV.delete(getUploadSessionKey(token));
    return null;
  }

  return session;
}

async function writeUploadSession(env, session, ttlSeconds = null) {
  const ttl = ttlSeconds || Math.max(Math.floor((session.expiresAt - Date.now()) / 1000), 60);

  await env.POSTS_KV.put(getUploadSessionKey(session.token), JSON.stringify(session), {
    expirationTtl: ttl,
  });
}

function publicSession(session, env) {
  return {
    title: session.title || "Недельный выпуск",
    description: session.description || "",
    status: session.status || "created",
    expiresAt: session.expiresAt,
    maxBytes: getMaxUploadBytes(env),
    maxBytesLabel: formatBytes(getMaxUploadBytes(env)),
    r2Ready: Boolean(env.PODCASTS_R2 && getR2Config(env)),
  };
}

function getUploadSessionKey(token) {
  return `${PODCAST_UPLOAD_SESSION_KEY_PREFIX}${token}`;
}

function getMaxUploadBytes(env) {
  const value = Number(env.PODCAST_UPLOAD_MAX_BYTES || 0);

  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_UPLOAD_BYTES;
}

function getR2Config(env) {
  const accountId = String(env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(env.R2_BUCKET_NAME || "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
  };
}

function normalizeVideoContentType(contentType) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();

  if (value.startsWith("video/")) {
    return value;
  }

  if (!value || value === "application/octet-stream") {
    return "video/mp4";
  }

  return "";
}

function createPodcastObjectKey(session, fileName, contentType) {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const extension = inferVideoExtension(fileName, contentType);

  return `${R2_PODCAST_VIDEO_KEY_PREFIX}${year}/${month}/${session.token}.${extension}`;
}

function inferVideoExtension(fileName, contentType) {
  const extension = String(fileName || "").toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  const allowedExtensions = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);

  if (extension && allowedExtensions.has(extension)) {
    return extension;
  }

  if (contentType.includes("webm")) {
    return "webm";
  }

  if (contentType.includes("quicktime")) {
    return "mov";
  }

  if (contentType.includes("matroska")) {
    return "mkv";
  }

  return "mp4";
}

function isValidToken(token) {
  return /^[a-f0-9]{48}$/i.test(token);
}

function isAllowedR2Key(key) {
  return key.startsWith(R2_PODCAST_VIDEO_KEY_PREFIX) && !key.includes("..") && key.length <= 240;
}

async function createPresignedPutUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  key,
  contentType,
  expiresIn,
}) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const canonicalUri = `/${encodePath(bucketName)}/${encodePath(key)}`;
  const queryPairs = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresIn)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQueryString = canonicalQuery(queryPairs);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = await getSigningKey(secretAccessKey, dateStamp);
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

async function getSigningKey(secretAccessKey, dateStamp) {
  const dateKey = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");

  return hmac(serviceKey, "aws4_request");
}

async function hmac(key, value) {
  const keyData = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return toHex(digest);
}

function canonicalQuery(pairs) {
  return pairs
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
  }

  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} МБ`;
  }

  return `${Math.round(bytes / 1024)} КБ`;
}

async function notifyTelegramUploadComplete(env, session, podcast) {
  if (!env.TELEGRAM_BOT_TOKEN || !session.chatId) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: session.chatId,
      text: [
        `Подкаст загружен: ${podcast.title}`,
        "Видео сохранено в R2 и добавлено на страницу подкастов.",
        `ID для удаления: ${podcast.messageId}`,
      ].join("\n"),
      reply_to_message_id: session.commandMessageId || undefined,
    }),
  }).catch(() => {});
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
