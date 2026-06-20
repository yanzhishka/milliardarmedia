const feedList = document.querySelector("[data-feed-list]");
const feedStatus = document.querySelector("[data-feed-status]");
const FEED_REFRESH_INTERVAL = 30000;
const FEED_CACHE_KEY = "milliardar-feed-posts-v1";
const FEED_REQUEST_TIMEOUT = 8000;
const FEED_PAGE_SIZE = 6;
const HOME_LIMIT = 6;
const feedSearchInput = document.querySelector("[data-feed-search] input");
const featuredSlot = document.querySelector("[data-featured]");
const isHome = document.body.classList.contains("home-page");
const LANG = (document.documentElement.lang || "ru").slice(0, 2) === "en" ? "en" : "ru";
const DATE_LOCALE = LANG === "en" ? "en-GB" : "ru-RU";
const STR = {
  ru: {
    loading: "Загружаем ленту…",
    cachedRetry: "Показываем последние загруженные публикации. Обновление ещё пробует подключиться.",
    slow: "Лента подключается дольше обычного. Попробуйте обновить страницу через несколько секунд.",
    cachedUpdating: "Показываем последние загруженные публикации. Обновляем ленту...",
    waitingFirst: "Ждём первые публикации из Telegram.",
    total: (n) => `Всего ${n} публикаций из Telegram.`,
    noResults: (q) => `По запросу «${q}» ничего не найдено.`,
    results: (q, n) => `Результаты по запросу «${q}»: ${n}.`,
    leadKicker: "Главный материал",
    read: "Читать материал",
    openTelegram: "Открыть в Telegram",
    showMore: (n) => `Показать ещё (${n})`,
    notFoundTitle: "Ничего не найдено.",
    notFoundText: "Попробуйте другой запрос или откройте всю ленту.",
    openMaterial: "Открыть материал",
    emptyTitle: "Пока без публикаций.",
    emptyText: "Когда в Telegram появятся новые записи, они соберутся здесь.",
    photoFromTg: "Фото из Telegram.",
    noText: "Публикация без текста.",
    imageAlt: "Изображение из Telegram",
    photoInTg: "Фото в Telegram",
    mediaInTg: "Медиа в Telegram",
  },
  en: {
    loading: "Loading the feed…",
    cachedRetry: "Showing the latest loaded posts. Still trying to refresh.",
    slow: "The feed is taking longer than usual. Try refreshing in a few seconds.",
    cachedUpdating: "Showing the latest loaded posts. Refreshing…",
    waitingFirst: "Waiting for the first posts from Telegram.",
    total: (n) => `${n} posts from Telegram.`,
    noResults: (q) => `Nothing found for “${q}”.`,
    results: (q, n) => `Results for “${q}”: ${n}.`,
    leadKicker: "Top story",
    read: "Read the story",
    openTelegram: "Open in Telegram",
    showMore: (n) => `Show more (${n})`,
    notFoundTitle: "Nothing found.",
    notFoundText: "Try another query or open the full feed.",
    openMaterial: "Open the story",
    emptyTitle: "No posts yet.",
    emptyText: "New posts from Telegram will appear here.",
    photoFromTg: "Photo from Telegram.",
    noText: "Post without text.",
    imageAlt: "Image from Telegram",
    photoInTg: "Photo in Telegram",
    mediaInTg: "Media in Telegram",
  },
}[LANG];
let lastFeedSignature = "";
let allPosts = [];
let visibleCount = FEED_PAGE_SIZE;
let searchQuery = (new URLSearchParams(window.location.search).get("q") || "").trim();

// Rubric tags that belong to the "Выпуски" section — these posts are hidden
// from the feed. Keep in sync with the filter chips on the Выпуски page.
const EPISODE_TAGS = ["#репортажир"];

initFeed();

async function initFeed() {
  if (!feedList || !feedStatus) {
    return;
  }

  initFeedSearch();

  if (readCachedPosts().length) {
    renderCachedFeed();
  } else {
    renderFeaturedSkeleton();
    renderFeedSkeletons();
    feedStatus.textContent = STR.loading;
  }

  await loadFeed();
  window.setInterval(loadFeed, FEED_REFRESH_INTERVAL);
}

// Reserve the hero slot height while the feed loads, so the real cover
// replacing it does not push the page down (CLS).
function renderFeaturedSkeleton() {
  if (!featuredSlot || searchQuery) {
    return;
  }

  const skeleton = document.createElement("div");

  skeleton.className = "lead-cover skel skeleton";
  featuredSlot.replaceChildren(skeleton);
  featuredSlot.hidden = false;
}

function renderFeedSkeletons(count = 4) {
  // On the home page the feed renders as a compact headline list — reserve
  // matching height so the swap to real headlines doesn't shift the layout.
  if (isHome) {
    feedList.classList.remove("feed-panel-list");
    feedList.classList.add("front-headlines");

    const headlines = Array.from({ length: HOME_LIMIT }, () => {
      const item = document.createElement("div");

      item.className = "front-headline skeleton";
      item.innerHTML =
        '<span class="skel skel-line is-kicker"></span>' +
        '<span class="skel skel-line is-lg"></span>' +
        '<span class="skel skel-line w-70"></span>';

      return item;
    });

    feedList.replaceChildren(...headlines);
    return;
  }

  const items = Array.from({ length: count }, (unused, index) => {
    const card = document.createElement("article");
    const copy = document.createElement("div");
    const figure = document.createElement("figure");
    const media = document.createElement("span");

    card.className = "feed-card skeleton has-media";
    copy.className = "feed-copy";
    copy.innerHTML =
      '<span class="skel skel-line is-kicker"></span>' +
      '<span class="skel skel-line is-lg"></span>' +
      '<span class="skel skel-line w-90"></span>' +
      '<span class="skel skel-line w-50"></span>';
    figure.className = "feed-media";
    media.className = "skel skel-media";
    figure.append(media);
    card.append(copy, figure);

    return card;
  });

  feedList.replaceChildren(...items);
}

async function loadFeed() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FEED_REQUEST_TIMEOUT);

  try {
    const response = await fetch(`/api/posts?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Feed endpoint is not ready");
    }

    const data = await response.json();
    const posts = Array.isArray(data.posts) ? data.posts : [];

    renderFeed(posts);
    saveCachedPosts(posts);
  } catch (error) {
    if (feedList.querySelector(".feed-card:not(.skeleton)")) {
      feedStatus.textContent = STR.cachedRetry;
      return;
    }

    renderFeed([], STR.slow);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderCachedFeed() {
  const cachedPosts = readCachedPosts();

  if (!cachedPosts.length) {
    return;
  }

  renderFeed(cachedPosts, STR.cachedUpdating);
}

function renderFeed(posts, statusText = "") {
  if (!posts.length) {
    feedStatus.textContent = statusText || STR.waitingFirst;
    clearFeatured();

    if (lastFeedSignature !== "empty") {
      lastFeedSignature = "empty";
      feedList.replaceChildren(createEmptyState());
    }

    return;
  }

  allPosts = posts;
  feedStatus.textContent = statusText || STR.total(getDisplayPosts().length);

  const signature = posts.map((post) => `${post.id || ""}:${post.date || ""}:${post.editedDate || ""}`).join("|");

  if (signature === lastFeedSignature) {
    return;
  }

  lastFeedSignature = signature;
  visibleCount = Math.max(visibleCount, FEED_PAGE_SIZE);
  paintFeed();
}

function isEpisodePost(post) {
  const text = `${post.text || post.caption || ""}`.toLowerCase();

  return EPISODE_TAGS.some((tag) => text.includes(tag));
}

function getDisplayPosts() {
  // Hide posts that belong to the "Выпуски" section (carry a rubric tag).
  let posts = allPosts.filter((post) => !isEpisodePost(post));

  if (searchQuery) {
    const query = searchQuery.toLowerCase();

    posts = posts.filter((post) => `${post.text || post.caption || ""}`.toLowerCase().includes(query));
  }

  return posts;
}

function paintFeed() {
  const display = getDisplayPosts();

  if (searchQuery && !display.length) {
    clearFeatured();
    feedStatus.textContent = STR.noResults(searchQuery);
    feedList.replaceChildren(createNoResults());
    return;
  }

  feedStatus.textContent = searchQuery
    ? STR.results(searchQuery, display.length)
    : STR.total(display.length);

  // featured lead (skip while searching)
  const featured = !searchQuery && featuredSlot ? display[0] : null;
  const rest = featured ? display.slice(1) : display;

  if (featuredSlot) {
    if (featured) {
      const cover = buildFeatured(featured);
      featuredSlot.replaceChildren(cover);
      featuredSlot.hidden = false;
      revealOnly([cover]);
    } else {
      clearFeatured();
    }
  }

  // Home = front page (compact headline list). Feed = full card archive.
  if (isHome) {
    feedList.classList.remove("feed-panel-list");
    feedList.classList.add("front-headlines");

    const headlines = rest.slice(0, HOME_LIMIT).map(createHeadline);

    feedList.replaceChildren(...headlines);
    registerReveal(headlines);
    return;
  }

  const cards = rest.slice(0, visibleCount).map(createFeedCard);

  feedList.replaceChildren(...cards);

  if (rest.length > visibleCount) {
    feedList.append(buildLoadMore(rest.length - visibleCount));
  }

  registerReveal(cards);
}

function clearFeatured() {
  if (featuredSlot) {
    featuredSlot.replaceChildren();
    featuredSlot.hidden = true;
  }
}

function buildFeatured(post) {
  const cover = document.createElement(post.messageId || post.link ? "a" : "div");
  const body = document.createElement("div");
  const kicker = document.createElement("span");
  const title = document.createElement("h2");
  const text = getFeedText(post).replace(/\s+/g, " ").trim();
  const date = post.date ? new Date(post.date * 1000) : null;
  const images = getPostImages(post);

  cover.className = "lead-cover";

  if (post.messageId) {
    cover.href = `/post/${post.messageId}`;
  } else if (post.link) {
    cover.href = post.link;
    cover.target = "_blank";
    cover.rel = "noopener";
  }

  if (images.length) {
    const image = document.createElement("img");

    image.src = images[0].url;
    image.alt = text ? text.slice(0, 90) : STR.leadKicker;
    image.loading = "eager";
    image.decoding = "async";
    cover.append(image);
  } else {
    cover.classList.add("no-image");
  }

  body.className = "lead-body";
  kicker.className = "lead-kicker";
  kicker.textContent = STR.leadKicker;
  title.textContent = text.length > 110 ? `${text.slice(0, 110).trim()}…` : text;
  body.append(kicker);

  if (date) {
    const time = document.createElement("time");

    time.dateTime = date.toISOString();
    time.textContent = formatFeedDate(date);
    body.append(time);
  }

  const arrow = document.createElement("span");
  arrow.className = "tile-arrow";
  arrow.textContent = STR.read;
  body.append(title, arrow);
  cover.append(body);

  return cover;
}

function buildLoadMore(remaining) {
  const wrap = document.createElement("div");
  const button = document.createElement("button");

  wrap.className = "feed-more";
  button.type = "button";
  button.className = "button button-glass";
  button.textContent = STR.showMore(remaining);
  button.addEventListener("click", () => {
    visibleCount += FEED_PAGE_SIZE;
    paintFeed();
  });

  wrap.append(button);

  return wrap;
}

function createNoResults() {
  const empty = document.createElement("article");
  const number = document.createElement("span");
  const title = document.createElement("h3");
  const text = document.createElement("p");

  empty.className = "feed-empty";
  number.textContent = "00";
  title.textContent = STR.notFoundTitle;
  text.textContent = STR.notFoundText;
  empty.append(number, title, text);

  return empty;
}

function initFeedSearch() {
  if (!feedSearchInput) {
    return;
  }

  feedSearchInput.value = searchQuery;

  feedSearchInput.closest("form").addEventListener("submit", (event) => {
    // On the home page let the form navigate to the full archive (/feed?q=).
    if (isHome) {
      return;
    }

    event.preventDefault();
    feedSearchInput.blur();
  });

  feedSearchInput.addEventListener("input", () => {
    searchQuery = feedSearchInput.value.trim();
    visibleCount = FEED_PAGE_SIZE;

    const url = new URL(window.location.href);

    if (searchQuery) {
      url.searchParams.set("q", searchQuery);
    } else {
      url.searchParams.delete("q");
    }

    window.history.replaceState(null, "", url);

    if (allPosts.length) {
      paintFeed();
    }
  });
}

// Light fade-in for the featured cover and for cards/headlines (no parallax).
function revealOnly(elements) {
  if (typeof window.observeReveal === "function") {
    window.observeReveal(elements);
  }
}

function registerReveal(items) {
  if (typeof window.observeReveal === "function") {
    items.forEach((item, index) => {
      item.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 60}ms`);
    });
    window.observeReveal(items);
  }
}

function readCachedPosts() {
  try {
    const cached = window.localStorage.getItem(FEED_CACHE_KEY);
    const posts = cached ? JSON.parse(cached) : [];

    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    return [];
  }
}

function saveCachedPosts(posts) {
  if (!posts.length) {
    return;
  }

  try {
    window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(posts));
  } catch (error) {
    // Ignore private mode and storage quota limits.
  }
}

function createFeedCard(post, index = 0) {
  const card = document.createElement("article");
  const copy = document.createElement("div");
  const time = document.createElement("time");
  const text = document.createElement("p");
  const link = document.createElement("a");
  const date = post.date ? new Date(post.date * 1000) : new Date();
  const media = createFeedMedia(post);

  card.className = "feed-card";
  copy.className = "feed-copy";
  card.classList.toggle("has-media", Boolean(media));
  time.dateTime = date.toISOString();
  time.textContent = formatFeedDate(date);
  text.textContent = getFeedText(post);

  if (post.messageId) {
    link.href = `/post/${post.messageId}`;
    link.textContent = STR.read;
  } else {
    link.href = post.link || "https://t.me/milliardarmedia";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = STR.openTelegram;
  }

  copy.append(time, text, link);
  card.append(copy);

  if (media) {
    card.append(media);
  }

  return card;
}

function createHeadline(post) {
  const item = document.createElement(post.messageId || post.link ? "a" : "div");
  const time = document.createElement("time");
  const title = document.createElement("h3");
  const date = post.date ? new Date(post.date * 1000) : new Date();
  const text = getFeedText(post).replace(/\s+/g, " ").trim();

  item.className = "front-headline";

  if (post.messageId) {
    item.href = `/post/${post.messageId}`;
  } else if (post.link) {
    item.href = post.link;
    item.target = "_blank";
    item.rel = "noopener";
  }

  time.dateTime = date.toISOString();
  time.textContent = formatFeedDate(date);
  title.textContent = text.length > 120 ? `${text.slice(0, 120).trim()}…` : text;

  item.append(time, title);

  return item;
}

function createFeedMedia(post) {
  const images = getPostImages(post);

  if (images.length > 1) {
    const figure = document.createElement("figure");

    figure.className = "feed-media feed-gallery";
    images.forEach((postImage, index) => {
      figure.append(createFeedImage(postImage, post, index));
    });

    return figure;
  }

  if (images.length === 1) {
    const figure = document.createElement("figure");

    figure.className = "feed-media";
    figure.append(createFeedImage(images[0], post, 0));

    return figure;
  }

  if (post.imageUrl) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");

    figure.className = "feed-media";
    image.src = post.imageUrl;
    image.alt = post.text ? post.text.slice(0, 90) : STR.imageAlt;
    image.loading = "lazy";
    image.decoding = "async";

    if (post.imageWidth) {
      image.width = post.imageWidth;
    }

    if (post.imageHeight) {
      image.height = post.imageHeight;
    }

    figure.append(wrapMediaLink(image, post));

    return figure;
  }

  if (post.mediaType && post.mediaType !== "text") {
    const placeholder = document.createElement("div");

    placeholder.className = "feed-media feed-media-placeholder";
    placeholder.textContent = post.mediaType === "photo" ? STR.photoInTg : STR.mediaInTg;

    return placeholder;
  }

  return null;
}

function createFeedImage(postImage, post, index) {
  const image = document.createElement("img");

  image.src = postImage.url;
  image.alt = post.text ? post.text.slice(0, 90) : STR.imageAlt;
  image.loading = "lazy";
  image.decoding = "async";

  if (postImage.width) {
    image.width = postImage.width;
  }

  if (postImage.height) {
    image.height = postImage.height;
  }

  return wrapMediaLink(image, post);
}

// Make the image itself open the full material (post page or Telegram).
function wrapMediaLink(node, post) {
  const href = post.messageId ? `/post/${post.messageId}` : post.link || "";

  if (!href) {
    return node;
  }

  const link = document.createElement("a");

  link.href = href;
  link.setAttribute("aria-label", STR.openMaterial);

  if (!post.messageId) {
    link.target = "_blank";
    link.rel = "noopener";
  }

  link.append(node);

  return link;
}

function getPostImages(post) {
  if (Array.isArray(post.images) && post.images.length) {
    return post.images
      .map((image) => ({
        url: image.url || "",
        width: image.width || null,
        height: image.height || null,
      }))
      .filter((image) => image.url);
  }

  if (post.imageUrl) {
    return [
      {
        url: post.imageUrl,
        width: post.imageWidth || null,
        height: post.imageHeight || null,
      },
    ];
  }

  return [];
}

function createEmptyState() {
  const empty = document.createElement("article");
  const number = document.createElement("span");
  const title = document.createElement("h3");
  const text = document.createElement("p");

  empty.className = "feed-empty";
  number.textContent = "00";
  title.textContent = STR.emptyTitle;
  text.textContent = STR.emptyText;

  empty.append(number, title, text);

  return empty;
}

function getFeedText(post) {
  if (post.text || post.caption) {
    return post.text || post.caption;
  }

  if (post.imageUrl || post.mediaType === "photo" || post.images?.length) {
    return STR.photoFromTg;
  }

  return STR.noText;
}

function formatFeedDate(date) {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
