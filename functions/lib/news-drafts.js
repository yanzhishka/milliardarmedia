const NEWS_DRAFT_KEY_PREFIX = "telegram_news_draft:";
const NEWS_DRAFT_REVIEW_KEY_PREFIX = "telegram_news_review:";
const NEWS_SEEN_KEY = "telegram_news_seen";
const NEWS_DRAFT_TTL_SECONDS = 14 * 24 * 60 * 60;
const MAX_SEEN_ITEMS = 360;

// This is the animated phone emoji already used in the channel footer.
export const CHANNEL_FOOTER_EMOJI_ID = "5330237710655306682";
export const CHANNEL_URL = "https://t.me/milliardarmedia";

// These custom emoji are already part of the channel's visual language. The
// model selects semantic categories, never raw emoji ids or Telegram markup.
// Keeping the mapping here makes the generated HTML safe and gives Telegram a
// reliable native-emoji fallback when Premium emoji are unavailable.
const CONTEXT_PREMIUM_EMOJIS = {
  positive: { emojiId: "5195306786155947802", fallback: "🙂" },
  discovery: { emojiId: "5470051501869140340", fallback: "🤯" },
  space: { emojiId: "5188481279963715781", fallback: "🚀" },
  transport: { emojiId: "5819098039406562961", fallback: "🚕" },
  business: { emojiId: "5314330921317473766", fallback: "🤑" },
};

export function createNewsDraftId() {
  return `${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function getNewsReviewChatIds(env) {
  const configured = String(env.NEWS_REVIEW_CHAT_IDS || env.TELEGRAM_ADMIN_IDS || "");

  return [...new Set(configured.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function isPremiumEmojiEnabled(env) {
  return /^(1|true|yes|on)$/i.test(String(env.TELEGRAM_PREMIUM_EMOJI || ""));
}

export function buildNewsPostHtml(draft, useCustomEmoji = false) {
  const headline = String(draft.headline || "").trim();
  const body = String(draft.body || "").trim();
  const emoji = normalizeEmoji(draft.emoji);
  const contextEmojis = normalizePremiumEmojiCategories(draft.premiumEmojiCategories)
    .map((category) => buildContextPremiumEmoji(category, useCustomEmoji));
  const keyPhrases = normalizeKeyPhrases(draft.keyPhrases, body);
  const parts = [];

  if (headline) {
    parts.push(`<b>${escapeHtml(headline)}</b>`);
  }

  if (body) {
    parts.push(formatParagraphs(body, emoji, contextEmojis, keyPhrases));
  }

  parts.push(buildChannelFooter(useCustomEmoji));

  return parts.join("\n\n");
}

export function normalizePremiumEmojiCategories(value) {
  const categories = Array.isArray(value) ? value : [];
  const valid = [...new Set(
    categories
      .map((category) => String(category || "").trim().toLowerCase())
      .filter((category) => Object.hasOwn(CONTEXT_PREMIUM_EMOJIS, category)),
  )].slice(0, 3);

  // A completed post should always have a friendly visual accent, including if
  // a model response is malformed or an older saved draft has no category.
  return valid.length ? valid : ["positive"];
}

export function normalizeKeyPhrases(value, body) {
  const source = String(body || "").trim();
  const sourceLower = source.toLocaleLowerCase("ru-RU");
  const phrases = Array.isArray(value) ? value : [];
  const seen = new Set();

  return phrases
    .map((phrase) => String(phrase || "").replace(/\s+/g, " ").trim())
    .filter((phrase) => phrase.length >= 3 && phrase.length <= 80)
    .filter((phrase) => sourceLower.includes(phrase.toLocaleLowerCase("ru-RU")))
    .filter((phrase) => {
      const key = phrase.toLocaleLowerCase("ru-RU");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function buildNewsReviewKeyboard(draft) {
  const sourceUrl = safeHttpUrl(draft.sourceUrl);
  const revision = Number(draft.reviewRevision || 1);
  const rows = [
    [
      { text: "✅ Готово к пересылке", callback_data: `news_ready:${draft.id}:${revision}` },
      { text: "✏️ Править", callback_data: `news_edit:${draft.id}:${revision}` },
    ],
    [{ text: "🗑 Пропустить", callback_data: `news_skip:${draft.id}:${revision}` }],
  ];

  if (sourceUrl) {
    rows.push([{ text: "🔗 Открыть источник", url: sourceUrl }]);
  }

  return { inline_keyboard: rows };
}

export function isNewsDraftCallback(data) {
  return /^news_(ready|edit|skip):[a-z0-9_-]+:\d+$/i.test(String(data || ""));
}

export function parseNewsDraftCallback(data) {
  const match = String(data || "").match(/^news_(ready|edit|skip):([a-z0-9_-]+):(\d+)$/i);

  return match ? { action: match[1].toLowerCase(), draftId: match[2], revision: Number(match[3]) } : null;
}

export async function saveNewsDraft(env, draft) {
  const next = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };

  await env.POSTS_KV.put(newsDraftKey(next.id), JSON.stringify(next), {
    expirationTtl: NEWS_DRAFT_TTL_SECONDS,
  });

  return next;
}

export async function readNewsDraft(env, draftId) {
  if (!draftId || !env.POSTS_KV) {
    return null;
  }

  return env.POSTS_KV.get(newsDraftKey(draftId), { type: "json" });
}

export async function saveNewsDraftReviewMessage(env, draft, chatId, messageId) {
  if (!chatId || !messageId) {
    return draft;
  }

  const reviewMessages = Array.isArray(draft.reviewMessages) ? draft.reviewMessages : [];
  const next = {
    ...draft,
    reviewMessages: [...reviewMessages, { chatId: String(chatId), messageId: Number(messageId) }].slice(-12),
  };

  await saveNewsDraft(env, next);
  await env.POSTS_KV.put(
    newsDraftReviewKey(chatId, messageId),
    next.id,
    { expirationTtl: NEWS_DRAFT_TTL_SECONDS },
  );

  return next;
}

export async function readNewsDraftForReviewMessage(env, chatId, messageId) {
  if (!chatId || !messageId || !env.POSTS_KV) {
    return null;
  }

  const draftId = await env.POSTS_KV.get(newsDraftReviewKey(chatId, messageId));

  return draftId ? readNewsDraft(env, draftId) : null;
}

export async function listNewsDrafts(env, limit = 12) {
  if (!env.POSTS_KV || typeof env.POSTS_KV.list !== "function") {
    return [];
  }

  // KV lists keys lexicographically (oldest generated ids first), so read the
  // whole short-lived collection before sorting by update time.
  const page = await env.POSTS_KV.list({ prefix: NEWS_DRAFT_KEY_PREFIX, limit: 1000 });
  const keys = (page.keys || []).map((item) => item.name);
  const drafts = await Promise.all(keys.map((key) => env.POSTS_KV.get(key, { type: "json" })));

  return drafts
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
    .slice(0, limit);
}

export async function hasSeenNews(env, candidate) {
  const seen = await readSeenNews(env);
  const keys = candidateKeys(candidate);

  return seen.some((item) => keys.includes(item.key));
}

export async function rememberSeenNews(env, candidate) {
  const seen = await readSeenNews(env);
  const key = candidateKey(candidate);

  if (!key) {
    return;
  }

  const next = [
    { key, at: Date.now(), title: String(candidate.title || "").slice(0, 180) },
    ...seen.filter((item) => item?.key !== key),
  ].slice(0, MAX_SEEN_ITEMS);

  await env.POSTS_KV.put(NEWS_SEEN_KEY, JSON.stringify(next));
}

export function candidateKey(candidate) {
  const sourceUrl = safeHttpUrl(candidate?.sourceUrl || candidate?.url);

  if (sourceUrl) {
    return `url:${sourceUrl.toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "")}`;
  }

  return candidate?.title ? `title:${normalizeComparableText(candidate.title)}` : "";
}

function candidateKeys(candidate) {
  const keys = [candidateKey(candidate)];
  const title = String(candidate?.title || "").trim();

  if (title) {
    keys.push(`title:${normalizeComparableText(title)}`);
  }

  return keys.filter(Boolean);
}

async function readSeenNews(env) {
  const seen = await env.POSTS_KV.get(NEWS_SEEN_KEY, { type: "json" });

  return Array.isArray(seen) ? seen : [];
}

function buildChannelFooter(useCustomEmoji) {
  const icon = useCustomEmoji
    ? `<tg-emoji emoji-id="${CHANNEL_FOOTER_EMOJI_ID}">📱</tg-emoji>`
    : "📱";

  return `${icon} <a href="${CHANNEL_URL}">Миллиардар</a>`;
}

function buildContextPremiumEmoji(category, useCustomEmoji) {
  const definition = CONTEXT_PREMIUM_EMOJIS[category];

  if (!definition) {
    return "";
  }

  return useCustomEmoji
    ? `<tg-emoji emoji-id="${definition.emojiId}">${definition.fallback}</tg-emoji>`
    : definition.fallback;
}

function formatParagraphs(value, emoji, contextEmojis = [], keyPhrases = []) {
  const paragraphs = value
    .split(/\n\s*\n+/)
    .map((paragraph) => highlightKeyPhrases(
      escapeHtml(paragraph.trim()).replace(/\n/g, "\n"),
      keyPhrases,
    ))
    .filter(Boolean);

  if (!paragraphs.length) {
    return "";
  }

  const decorations = contextEmojis.filter(Boolean).join(" ");

  if (decorations) {
    paragraphs[paragraphs.length - 1] = `${paragraphs.at(-1)} ${decorations}`;
  } else if (emoji && !paragraphs.join(" ").includes(emoji)) {
    paragraphs[paragraphs.length - 1] = `${paragraphs.at(-1)} ${emoji}`;
  }

  return paragraphs.join("\n\n");
}

function highlightKeyPhrases(value, keyPhrases) {
  const escapedPhrases = keyPhrases
    .map((phrase) => escapeHtml(phrase))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (!escapedPhrases.length) {
    return value;
  }

  const pattern = escapedPhrases.map(escapeRegExp).join("|");

  return value.replace(new RegExp(`(${pattern})`, "giu"), "<b>$1</b>");
}

function normalizeEmoji(value) {
  const emoji = String(value || "").trim();

  // A short, visible native emoji is safe in Telegram and prevents the model from
  // inserting arbitrary HTML or a long reaction string.
  return emoji.length > 0 && emoji.length <= 8 ? emoji : "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));

    return /^(https?):$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeComparableText(value) {
  return String(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 220);
}

function newsDraftKey(draftId) {
  return `${NEWS_DRAFT_KEY_PREFIX}${draftId}`;
}

function newsDraftReviewKey(chatId, messageId) {
  return `${NEWS_DRAFT_REVIEW_KEY_PREFIX}${chatId}:${messageId}`;
}
