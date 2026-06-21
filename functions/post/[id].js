const POSTS_KEY = "telegram_posts";
const DEFAULT_FEED_RESET_AT = 1779913144;
const ASSET_VERSION = "20260620-nyt12";

export async function onRequestGet({ params, request, env }) {
  const origin = new URL(request.url).origin;
  const id = String(params.id || "").replace(/[^0-9]/g, "");

  if (!env.POSTS_KV || !id) {
    return htmlResponse(renderNotFound(origin), 404);
  }

  const raw = await env.POSTS_KV.get(POSTS_KEY, { type: "json" });
  const posts = Array.isArray(raw) ? raw : [];
  const resetAt = Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
  const visible = posts.filter((post) => Number(post.date || 0) >= resetAt);
  const post = findPost(visible, id);

  if (!post) {
    return htmlResponse(renderNotFound(origin), 404);
  }

  const images = gatherImages(visible, post);
  const optimize = env.IMAGE_RESIZING === "on";

  return htmlResponse(renderPost(post, images, origin, optimize), 200);
}

// Cloudflare Image Resizing wrapper. Off unless IMAGE_RESIZING=on is set,
// because /cdn-cgi/image/ only works when the feature is enabled on the zone.
function optimizedPath(url, width, optimize) {
  if (!optimize || !url.startsWith("/")) {
    return url;
  }

  return `/cdn-cgi/image/width=${width},format=auto,quality=82${url}`;
}

function findPost(posts, id) {
  const numeric = Number(id);

  return (
    posts.find((post) => {
      if (Number(post.messageId) === numeric) {
        return true;
      }

      if (Array.isArray(post.messageIds) && post.messageIds.some((mid) => Number(mid) === numeric)) {
        return true;
      }

      return new RegExp(`/${id}(?:\\?.*)?$`).test(String(post.link || ""));
    }) || null
  );
}

function gatherImages(posts, post) {
  const collected = [];

  const pushFrom = (item) => {
    if (Array.isArray(item.images)) {
      item.images.forEach((image) => {
        if (image.url) {
          collected.push(image);
        }
      });
    }

    if (item.imageUrl) {
      collected.push({ url: item.imageUrl, width: item.imageWidth, height: item.imageHeight });
    }
  };

  if (post.mediaGroupId) {
    posts
      .filter((item) => item.mediaGroupId === post.mediaGroupId && String(item.chatId) === String(post.chatId))
      .forEach(pushFrom);
  } else {
    pushFrom(post);
  }

  const seen = new Set();

  return collected.filter((image) => {
    if (seen.has(image.url)) {
      return false;
    }

    seen.add(image.url);

    return true;
  });
}

function renderPost(post, images, origin, optimize) {
  const text = String(post.text || post.caption || "").trim();
  const firstLine = (text.split(/\n+/)[0] || "Публикация").slice(0, 70);
  const title = `${firstLine} — Миллиардар`;
  const description = (text || "Публикация журналистского агентства Миллиардар.").replace(/\s+/g, " ").slice(0, 200);
  const ogImage = images[0]
    ? `${origin}${optimizedPath(images[0].url, 1200, optimize)}`
    : `${origin}/assets/logo-generated-full.png`;
  const canonical = `${origin}/post/${post.messageId}`;
  const tgLink = post.link || "https://t.me/milliardarmedia";
  const date = post.date ? new Date(post.date * 1000) : null;
  const dateText = date
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
    : "";
  const dateIso = date ? date.toISOString() : "";

  const mediaHtml = images.length
    ? `<figure class="post-media${images.length > 1 ? " post-gallery" : ""}">${images
        .map(
          (image) =>
            `<img src="${escapeAttr(optimizedPath(image.url, 1400, optimize))}" alt="${escapeAttr(firstLine)}" loading="lazy" decoding="async"${
              image.width ? ` width="${Number(image.width)}"` : ""
            }${image.height ? ` height="${Number(image.height)}"` : ""} />`,
        )
        .join("")}</figure>`
    : "";

  const bodyHtml = text
    ? text
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br />")}</p>`)
        .join("")
    : '<p class="post-muted">Публикация без текста.</p>';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>(function(){try{var t=localStorage.getItem("theme")||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();</script>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <link rel="canonical" href="${escapeAttr(canonical)}" />
    <link rel="alternate" hreflang="ru" href="${escapeAttr(canonical)}" />
    <link rel="alternate" hreflang="x-default" href="${escapeAttr(canonical)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Миллиардар" />
    <meta property="og:title" content="${escapeAttr(firstLine)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(canonical)}" />
    <meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:locale" content="ru_RU" />
    <meta property="og:locale:alternate" content="en_US" />
    ${images[0]?.width ? `<meta property="og:image:width" content="${Number(images[0].width)}" />` : ""}
    ${images[0]?.height ? `<meta property="og:image:height" content="${Number(images[0].height)}" />` : ""}
    ${dateIso ? `<meta property="article:published_time" content="${dateIso}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(firstLine)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
    <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: firstLine,
      description,
      image: [ogImage],
      datePublished: dateIso || undefined,
      dateModified: dateIso || undefined,
      mainEntityOfPage: canonical,
      inLanguage: "ru",
      author: { "@type": "Organization", name: "Миллиардар", url: origin },
      publisher: {
        "@type": "Organization",
        name: "Миллиардар",
        logo: { "@type": "ImageObject", url: origin + "/assets/logo-generated-full.png" },
      },
    }).replace(/</g, "\\u003c")}</script>
    <link rel="icon" href="/assets/logo-favicon.png?v=20260620-tab" type="image/png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
  </head>
  <body class="post-page">
    <header class="site-header">
      <div class="masthead-top">
        <span class="masthead-date" data-date></span>
        <div class="masthead-tools">
          <a class="header-cta" href="/feed">Вся лента</a>
          <button class="theme-toggle" type="button" data-theme-toggle aria-label="Переключить тему" aria-pressed="false">
            <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>
            <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
          </button>
        </div>
      </div>
      <a class="brand" href="/" aria-label="Миллиардар - главная">
        <span class="brand-name">Миллиардар</span>
      </a>
      <nav class="site-nav" aria-label="Разделы">
        <a href="/feed">Лента</a>
        <a href="/podcasts">Подкасты</a>
        <a href="/about">О нас</a>
      </nav>
    </header>

    <main id="top" class="post-main">
      <article class="post-article glass glass-dark">
        <a class="post-back" href="/feed">← Лента</a>
        ${dateText ? `<time class="post-date" datetime="${dateIso}">${escapeHtml(dateText)}</time>` : ""}
        <div class="post-body">${bodyHtml}</div>
        ${mediaHtml}
        <div class="post-actions">
          <a class="button button-primary" href="${escapeAttr(tgLink)}" target="_blank" rel="noopener">Открыть в Telegram</a>
          <a class="button button-glass" href="/feed">Вернуться к ленте</a>
        </div>
      </article>
    </main>

    <footer class="site-footer">
      <div>
        <strong>Миллиардар</strong>
        <span>Журналистское агентство</span>
      </div>
      <nav aria-label="Навигация в подвале">
        <a href="/">Главная</a>
        <a href="/feed">Лента</a>
        <a href="/podcasts">Подкасты</a>
      </nav>
      <a href="#top">Наверх</a>
    </footer>

    <script src="/motion.js?v=${ASSET_VERSION}"></script>
    <script src="/navigation.js?v=${ASSET_VERSION}"></script>
  </body>
</html>`;
}

function renderNotFound(origin) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>(function(){try{var t=localStorage.getItem("theme")||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();</script>
    <title>Публикация не найдена — Миллиардар</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" href="/assets/logo-favicon.png?v=20260620-tab" type="image/png" />
    <link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&family=PT+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css?v=${ASSET_VERSION}" />
  </head>
  <body class="post-page">
    <main id="top" class="post-main">
      <article class="post-article">
        <p class="section-kicker">Ошибка 404</p>
        <h1 class="post-404-title">Публикация не найдена.</h1>
        <p class="post-muted">Возможно, запись удалена или ещё не загружена в ленту.</p>
        <div class="post-actions">
          <a class="button button-primary" href="/feed">Открыть ленту</a>
          <a class="button button-glass" href="/">На главную</a>
        </div>
      </article>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
