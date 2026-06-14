const feedList = document.querySelector("[data-feed-list]");
const feedStatus = document.querySelector("[data-feed-status]");
const FEED_REFRESH_INTERVAL = 30000;
const FEED_CACHE_KEY = "milliardar-feed-posts-v1";
const FEED_REQUEST_TIMEOUT = 8000;
let lastFeedSignature = "";

initFeed();

async function initFeed() {
  if (!feedList || !feedStatus) {
    return;
  }

  renderCachedFeed();
  await loadFeed();
  window.setInterval(loadFeed, FEED_REFRESH_INTERVAL);
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
    if (feedList.querySelector(".feed-card")) {
      feedStatus.textContent = "Показываем последние загруженные публикации. Обновление ещё пробует подключиться.";
      return;
    }

    renderFeed([], "Лента подключается дольше обычного. Попробуйте обновить страницу через несколько секунд.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderCachedFeed() {
  const cachedPosts = readCachedPosts();

  if (!cachedPosts.length) {
    return;
  }

  renderFeed(cachedPosts, "Показываем последние загруженные публикации. Обновляем ленту...");
}

function renderFeed(posts, statusText = "") {
  if (!posts.length) {
    feedStatus.textContent = statusText || "Ждём первые публикации из Telegram.";

    if (lastFeedSignature !== "empty") {
      lastFeedSignature = "empty";
      feedList.replaceChildren(createEmptyState());
    }

    return;
  }

  feedStatus.textContent = statusText || `Всего ${posts.length} публикаций из Telegram.`;

  const signature = posts.map((post) => `${post.id || ""}:${post.date || ""}:${post.editedDate || ""}`).join("|");

  if (signature === lastFeedSignature) {
    return;
  }

  lastFeedSignature = signature;

  const cards = posts.map(createFeedCard);
  feedList.replaceChildren(...cards);
  registerReveal(cards);
}

function registerReveal(cards) {
  if (typeof window.observeReveal !== "function") {
    return;
  }

  cards.forEach((card, index) => {
    card.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 80}ms`);
  });

  window.observeReveal(cards);

  if (typeof window.attachTilt === "function") {
    window.attachTilt(cards);
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

  card.className = "feed-card glass tilt";
  card.dataset.tilt = "4";
  copy.className = "feed-copy";
  card.classList.toggle("has-media", Boolean(media));
  card.classList.toggle("is-featured", index === 0);
  time.dateTime = date.toISOString();
  time.textContent = formatFeedDate(date);
  text.textContent = getFeedText(post);
  link.href = post.link || "https://t.me/milliardarmedia";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Открыть в Telegram";

  copy.append(time, text, link);
  card.append(copy);

  if (media) {
    card.append(media);
  }

  return card;
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
    image.alt = post.text
      ? `Изображение к публикации: ${post.text.slice(0, 90)}`
      : "Изображение из Telegram";
    image.loading = "lazy";
    image.decoding = "async";

    if (post.imageWidth) {
      image.width = post.imageWidth;
    }

    if (post.imageHeight) {
      image.height = post.imageHeight;
    }

    figure.append(image);

    return figure;
  }

  if (post.mediaType && post.mediaType !== "text") {
    const placeholder = document.createElement("div");

    placeholder.className = "feed-media feed-media-placeholder";
    placeholder.textContent = post.mediaType === "photo" ? "Фото в Telegram" : "Медиа в Telegram";

    return placeholder;
  }

  return null;
}

function createFeedImage(postImage, post, index) {
  const image = document.createElement("img");

  image.src = postImage.url;
  image.alt = post.text
    ? `Изображение ${index + 1} к публикации: ${post.text.slice(0, 90)}`
    : `Изображение ${index + 1} из Telegram`;
  image.loading = "lazy";
  image.decoding = "async";

  if (postImage.width) {
    image.width = postImage.width;
  }

  if (postImage.height) {
    image.height = postImage.height;
  }

  return image;
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
  title.textContent = "Пока без публикаций.";
  text.textContent = "Когда в Telegram появятся новые записи, они соберутся здесь.";

  empty.append(number, title, text);

  return empty;
}

function getFeedText(post) {
  if (post.text || post.caption) {
    return post.text || post.caption;
  }

  if (post.imageUrl || post.mediaType === "photo" || post.images?.length) {
    return "Фото из Telegram.";
  }

  return "Публикация без текста.";
}

function formatFeedDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
