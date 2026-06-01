const feedList = document.querySelector("[data-feed-list]");
const feedStatus = document.querySelector("[data-feed-status]");
const revealItems = document.querySelectorAll(".reveal");
const FEED_REFRESH_INTERVAL = 30000;

initReveal();
initFeed();

function initReveal() {
  if (!revealItems.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  revealItems.forEach((item) => observer.observe(item));
}

async function initFeed() {
  if (!feedList || !feedStatus) {
    return;
  }

  await loadFeed();
  window.setInterval(loadFeed, FEED_REFRESH_INTERVAL);
}

async function loadFeed() {
  try {
    const response = await fetch("/api/posts", {
      cache: "no-store",
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
  } catch (error) {
    renderFeed([], "Лента появится здесь после подключения Telegram webhook в Cloudflare.");
  }
}

function renderFeed(posts, emptyStatus = "Ждём первые публикации из Telegram.") {
  if (!posts.length) {
    feedStatus.textContent = emptyStatus;
    feedList.replaceChildren(createEmptyState());
    return;
  }

  feedStatus.textContent = `Всего ${posts.length} публикаций из Telegram.`;
  feedList.replaceChildren(...posts.map(createFeedCard));
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
