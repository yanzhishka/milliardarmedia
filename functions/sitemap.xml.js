const POSTS_KEY = "telegram_posts";
const DEFAULT_FEED_RESET_AT = 1779913144;

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  const raw = env.POSTS_KV ? await env.POSTS_KV.get(POSTS_KEY, { type: "json" }) : null;
  const posts = Array.isArray(raw) ? raw : [];
  const resetAt = Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
  const seen = new Set();

  const urls = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/feed`, priority: "0.9" },
    { loc: `${origin}/podcasts`, priority: "0.8" },
  ];

  posts
    .filter((post) => Number(post.date || 0) >= resetAt && post.messageId)
    .forEach((post) => {
      if (seen.has(post.messageId)) {
        return;
      }

      seen.add(post.messageId);
      urls.push({
        loc: `${origin}/post/${post.messageId}`,
        lastmod: new Date(Number(post.date) * 1000).toISOString(),
        priority: "0.6",
      });
    });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) =>
      `  <url><loc>${url.loc}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}<priority>${url.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
