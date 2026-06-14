const POSTS_KEY = "telegram_posts";
const DEFAULT_FEED_RESET_AT = 1779913144;
const MAX_ITEMS = 40;

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const raw = env.POSTS_KV ? await env.POSTS_KV.get(POSTS_KEY, { type: "json" }) : null;
  const posts = Array.isArray(raw) ? raw : [];
  const resetAt = Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
  const items = posts
    .filter((post) => Number(post.date || 0) >= resetAt)
    .sort((a, b) => Number(b.date || 0) - Number(a.date || 0))
    .slice(0, MAX_ITEMS);

  const lastBuild = items[0] ? new Date(Number(items[0].date) * 1000) : new Date();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Миллиардар — лента</title>
    <link>${origin}/feed</link>
    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Публикации журналистского агентства «Миллиардар».</description>
    <language>ru</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
${items.map((post) => renderItem(post, origin)).join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function renderItem(post, origin) {
  const text = String(post.text || post.caption || "").trim();
  const title = (text.split(/\n+/)[0] || "Публикация").slice(0, 120);
  const link = post.messageId ? `${origin}/post/${post.messageId}` : post.link || `${origin}/feed`;
  const date = post.date ? new Date(Number(post.date) * 1000) : new Date();

  return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(String(post.id || link))}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <description><![CDATA[${text || "Публикация без текста."}]]></description>
    </item>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
