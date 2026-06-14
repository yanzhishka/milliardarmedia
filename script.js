const form = document.querySelector("#contact-form");
const formNote = document.querySelector(".form-note");
const submitButton = form.querySelector('button[type="submit"]');
const people = document.querySelectorAll(".person");
const rickrollModal = document.querySelector("#rickroll-modal");
const rickrollVideo = rickrollModal.querySelector("video");
const rickrollClose = rickrollModal.querySelector(".rickroll-close");
const commandForm = document.querySelector("#command-console");
const commandInput = document.querySelector("#command-input");
const consoleOutput = document.querySelector(".console-output");
const lazyPortraits = document.querySelectorAll(".portrait[data-src]");
const feedTicker = document.querySelector("[data-feed-ticker]");
const homeFeedList = document.querySelector("[data-home-feed]");
const newsOrbit = document.querySelector("[data-news-orbit]");
const newsSearchInput = document.querySelector("[data-news-search] input");
let lastOrbitSignature = "";
// right-biased so bubbles surround the headline without covering it
const ORBIT_SLOTS = [
  { x: 60, y: 16, s: 1.12 },
  { x: 80, y: 9, s: 0.85 },
  { x: 91, y: 30, s: 1.0 },
  { x: 67, y: 45, s: 1.16 },
  { x: 85, y: 58, s: 0.9 },
  { x: 55, y: 72, s: 0.95 },
  { x: 75, y: 80, s: 1.06 },
  { x: 93, y: 78, s: 0.8 },
  { x: 47, y: 40, s: 0.78 },
];
const canAnimateCursor =
  window.matchMedia("(pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FEED_REFRESH_INTERVAL = 30000;
const TICKER_REPEAT_COUNT = 3;
const TICKER_VISIBLE_POSTS = 6;
const TICKER_TEXT_LIMIT = 135;
const TICKER_PIXELS_PER_SECOND = 14;
const TICKER_MIN_DURATION = 140;
let sixtySevenTimer;
let lastTickerSignature = "";
let lastHomeFeedSignature = "init";
const HOME_FEED_VISIBLE = 4;

initLazyPortraits();
initTelegramFeed();

if (canAnimateCursor) {
  initCursorSticker();
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

people.forEach((person) => {
  person.addEventListener("toggle", () => {
    if (!person.open) {
      return;
    }

    people.forEach((otherPerson) => {
      if (otherPerson !== person) {
        otherPerson.open = false;
      }
    });
  });
});

commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  executeConsoleCommand();
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  executeConsoleCommand();
});

function executeConsoleCommand() {
  const command = commandInput.value.trim().toLowerCase();
  commandInput.value = "";

  if (!command) {
    consoleOutput.textContent = "";
    return;
  }

  runConsoleCommand(command);
}

rickrollClose.addEventListener("click", closeRickroll);

rickrollModal.addEventListener("click", (event) => {
  if (event.target === rickrollModal) {
    closeRickroll();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && rickrollModal.classList.contains("is-open")) {
    closeRickroll();
  }
});

function openRickroll() {
  rickrollModal.classList.add("is-open");
  rickrollModal.setAttribute("aria-hidden", "false");

  if (!rickrollVideo.getAttribute("src")) {
    rickrollVideo.src = rickrollVideo.dataset.src;
    rickrollVideo.load();
  }

  rickrollVideo.currentTime = 0;
  rickrollVideo.play().catch(() => {
    rickrollVideo.controls = true;
  });
  rickrollClose.focus();
}

function closeRickroll() {
  rickrollModal.classList.remove("is-open");
  rickrollModal.setAttribute("aria-hidden", "true");
  rickrollVideo.pause();
  rickrollVideo.currentTime = 0;
  rickrollVideo.removeAttribute("src");
  rickrollVideo.load();
}

function runConsoleCommand(command) {
  if (command === "rickroll") {
    consoleOutput.textContent = "открываем медиафайл";
    openRickroll();
    return;
  }

  if (command === "67") {
    consoleOutput.textContent = "команда 67 активирована";
    triggerSixtySeven();
    return;
  }

  consoleOutput.textContent = `команда не найдена: ${command}`;
}

function triggerSixtySeven() {
  let badge = document.querySelector(".sixty-seven-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.className = "sixty-seven-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "67";
    document.body.append(badge);
  }

  document.body.classList.remove("is-sixty-seven");
  window.requestAnimationFrame(() => {
    document.body.classList.add("is-sixty-seven");
  });

  window.clearTimeout(sixtySevenTimer);
  sixtySevenTimer = window.setTimeout(() => {
    document.body.classList.remove("is-sixty-seven");
  }, 1500);
}

function initLazyPortraits() {
  if (!lazyPortraits.length) {
    return;
  }

  const loadPortrait = (image) => {
    const fallback = image.dataset.fallback;

    if (fallback) {
      image.addEventListener(
        "error",
        () => {
          if (image.src.endsWith(fallback)) {
            return;
          }

          image.src = fallback;
        },
        { once: true },
      );
    }

    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  };

  if (!("IntersectionObserver" in window)) {
    lazyPortraits.forEach(loadPortrait);
    return;
  }

  const portraitObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        loadPortrait(entry.target);
        portraitObserver.unobserve(entry.target);
      });
    },
    {
      rootMargin: "160px 0px",
      threshold: 0.01,
    },
  );

  lazyPortraits.forEach((image) => portraitObserver.observe(image));
}

async function initTelegramFeed() {
  if (!feedTicker && !homeFeedList && !newsOrbit) {
    return;
  }

  renderHomeFeedSkeletons();
  initNewsSearch();
  await loadTelegramFeed();
  window.setInterval(loadTelegramFeed, FEED_REFRESH_INTERVAL);
}

function renderHomeFeedSkeletons() {
  if (!homeFeedList) {
    return;
  }

  const items = Array.from({ length: HOME_FEED_VISIBLE }, () => {
    const li = document.createElement("li");

    li.className = "home-feed-item skeleton";
    li.innerHTML =
      '<span class="skel skel-line is-kicker"></span>' +
      '<span class="skel skel-line w-90"></span>';

    return li;
  });

  homeFeedList.replaceChildren(...items);
}

async function loadTelegramFeed() {
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
    renderFeedTicker([]);
    renderHomeFeed([]);
    renderNewsOrbit([]);
  }
}

function renderFeed(posts) {
  renderFeedTicker(posts);
  renderHomeFeed(posts);
  renderNewsOrbit(posts);
}

function renderNewsOrbit(posts) {
  if (!newsOrbit) {
    return;
  }

  const items = (posts.length ? posts : demoOrbitPosts()).slice(0, ORBIT_SLOTS.length);
  const signature = items.map((post) => `${post.id || post.text || ""}:${post.date || ""}`).join("|");

  if (signature === lastOrbitSignature) {
    return;
  }

  lastOrbitSignature = signature;
  newsOrbit.replaceChildren(...items.map(createNewsBubble), ...createSparks());
}

function createNewsBubble(post, index) {
  const slot = ORBIT_SLOTS[index % ORBIT_SLOTS.length];
  const bubble = document.createElement(post.messageId || post.link ? "a" : "div");
  const inner = document.createElement("span");
  const imageUrl = firstImageUrl(post);
  const text = getFeedText(post).replace(/\s+/g, " ").trim();
  const date = post.date ? new Date(post.date * 1000) : null;
  const size = Math.round(Math.min(150, Math.max(72, 96 * slot.s)));

  bubble.className = "news-bubble";
  bubble.style.left = `${slot.x}%`;
  bubble.style.top = `${slot.y}%`;
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.style.setProperty("--dur", `${(6 + (index % 4) * 1.3).toFixed(1)}s`);
  bubble.style.setProperty("--delay", `${(index * 0.4).toFixed(1)}s`);
  bubble.style.setProperty("--dy", `${index % 2 ? -18 : -26}px`);
  bubble.style.setProperty("--dx", `${index % 2 ? 10 : -8}px`);
  bubble.dataset.text = text.toLowerCase();

  if (bubble.tagName === "A" && post.messageId) {
    bubble.href = `/post/${post.messageId}`;
  } else if (bubble.tagName === "A") {
    bubble.href = post.link;
  }

  inner.className = "news-bubble-inner";

  if (imageUrl) {
    const image = document.createElement("img");

    image.src = imageUrl;
    image.alt = text ? text.slice(0, 80) : "Публикация из Telegram";
    image.loading = "lazy";
    image.decoding = "async";
    inner.append(image);
    bubble.classList.add("has-image");
  } else {
    const snippet = document.createElement("p");

    snippet.textContent = text;
    inner.append(snippet);
    bubble.classList.add("is-text");
  }

  if (date) {
    const time = document.createElement("span");

    time.className = "news-bubble-time";
    time.textContent = formatFeedDate(date);
    inner.append(time);
  }

  const cap = document.createElement("span");
  cap.className = "news-bubble-cap";
  cap.textContent = text || "Публикация";
  bubble.append(inner, cap);

  return bubble;
}

function createSparks() {
  const positions = [
    { x: 12, y: 6 },
    { x: 60, y: 4 },
    { x: 94, y: 30 },
    { x: 6, y: 70 },
    { x: 47, y: 86 },
    { x: 78, y: 78 },
  ];

  return positions.map((pos, index) => {
    const spark = document.createElement("span");

    spark.className = "news-spark";
    spark.setAttribute("aria-hidden", "true");
    spark.style.left = `${pos.x}%`;
    spark.style.top = `${pos.y}%`;
    spark.style.animationDelay = `${(index * 0.5).toFixed(1)}s`;

    return spark;
  });
}

function firstImageUrl(post) {
  if (Array.isArray(post.images) && post.images.length && post.images[0].url) {
    return post.images[0].url;
  }

  return post.imageUrl || "";
}

function demoOrbitPosts() {
  const now = Math.floor(Date.now() / 1000);

  return [
    { text: "Редакция собрала факты недели в один материал", date: now - 1800, messageId: 0 },
    { text: "Короткая заметка из Telegram-канала", date: now - 5400 },
    { text: "Новый выпуск подкаста уже на сайте", date: now - 9000 },
    { text: "Интервью с героем номера", date: now - 14400 },
    { text: "Что стоит за главной новостью дня", date: now - 21600 },
    { text: "Фоторепортаж с места событий", date: now - 30000 },
    { text: "Разбор: как читать поток новостей", date: now - 43200 },
  ];
}

function initNewsSearch() {
  if (!newsSearchInput || !newsOrbit) {
    return;
  }

  newsSearchInput.addEventListener("input", () => {
    const query = newsSearchInput.value.trim().toLowerCase();

    newsOrbit.querySelectorAll(".news-bubble").forEach((bubble) => {
      const matches = !query || (bubble.dataset.text || "").includes(query);

      bubble.classList.toggle("is-dim", !matches);
    });
  });
}

function renderHomeFeed(posts) {
  if (!homeFeedList) {
    return;
  }

  const visible = posts.slice(0, HOME_FEED_VISIBLE);
  const signature = visible.map((post) => `${post.id || ""}:${post.date || ""}`).join("|");

  if (signature === lastHomeFeedSignature) {
    return;
  }

  lastHomeFeedSignature = signature;

  if (!visible.length) {
    homeFeedList.replaceChildren(createHomeFeedItem({ text: "Скоро здесь появятся первые публикации из Telegram." }));
    return;
  }

  homeFeedList.replaceChildren(...visible.map(createHomeFeedItem));
}

function createHomeFeedItem(post) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  const text = document.createElement("p");
  const date = post.date ? new Date(post.date * 1000) : null;

  item.className = "home-feed-item";
  time.textContent = date ? formatFeedDate(date) : "Live";
  text.textContent = getFeedText(post).replace(/\s+/g, " ").trim();

  item.append(time, text);

  return item;
}

function renderFeedTicker(posts) {
  if (!feedTicker) {
    return;
  }

  const signature = posts.map((post) => `${post.id || ""}:${post.date || ""}`).join("|");

  if (signature === lastTickerSignature) {
    return;
  }

  lastTickerSignature = signature;

  if (!posts.length) {
    feedTicker.classList.add("is-empty");
    feedTicker.replaceChildren(createTickerItem({ text: "Ждём первые публикации из Telegram" }));
    feedTicker.style.removeProperty("--ticker-duration");
    return;
  }

  feedTicker.classList.remove("is-empty");

  const visiblePosts = posts.slice(0, TICKER_VISIBLE_POSTS);
  const tickerPosts = Array.from({ length: TICKER_REPEAT_COUNT }, () => visiblePosts).flat();
  feedTicker.replaceChildren(...tickerPosts.map(createTickerItem));
  window.requestAnimationFrame(updateTickerSpeed);
}

function createTickerItem(post) {
  const item = document.createElement("span");
  const time = document.createElement("span");
  const text = document.createElement("span");
  const date = post.date ? new Date(post.date * 1000) : null;

  item.className = "top-feed-item";
  time.className = "top-feed-time";
  time.textContent = date ? formatFeedDate(date) : "Live";
  text.textContent = getTickerText(post);

  item.append(time, text);

  return item;
}

function updateTickerSpeed() {
  if (!feedTicker || feedTicker.classList.contains("is-empty")) {
    return;
  }

  const distance = feedTicker.scrollWidth / TICKER_REPEAT_COUNT;
  const duration = Math.max(TICKER_MIN_DURATION, Math.round(distance / TICKER_PIXELS_PER_SECOND));

  feedTicker.style.setProperty("--ticker-duration", `${duration}s`);
}

function getTickerText(post) {
  const text = getFeedText(post).replace(/\s+/g, " ").trim();

  if (text.length <= TICKER_TEXT_LIMIT) {
    return text;
  }

  return `${text.slice(0, TICKER_TEXT_LIMIT).trim()}...`;
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

function initCursorSticker() {
  const sticker = document.createElement("div");
  const leftEye = document.createElement("span");
  const rightEye = document.createElement("span");
  const smile = document.createElement("span");
  let frameId = 0;
  let hideTimer = 0;
  let x = -80;
  let y = -80;
  let rotation = 0;

  sticker.className = "cursor-sticker";
  leftEye.className = "cursor-sticker-eye";
  rightEye.className = "cursor-sticker-eye";
  smile.className = "cursor-sticker-smile";
  sticker.setAttribute("aria-hidden", "true");
  sticker.append(leftEye, rightEye, smile);
  document.body.append(sticker);

  window.addEventListener(
    "pointermove",
    (event) => {
      x = event.clientX + 18;
      y = event.clientY + 14;
      rotation = Math.sin(event.clientX * 0.015) * 7;
      sticker.classList.add("is-visible");

      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        sticker.classList.remove("is-visible");
      }, 1200);

      if (!frameId) {
        frameId = requestAnimationFrame(updateCursorSticker);
      }
    },
    { passive: true },
  );

  window.addEventListener("pointerleave", () => {
    sticker.classList.remove("is-visible");
  });

  function updateCursorSticker() {
    frameId = 0;
    sticker.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    formNote.textContent = "Заполните поля, чтобы мы могли ответить.";
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);
  const defaultButtonText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Отправляем";
  formNote.textContent = "";

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Form submission failed");
    }

    formNote.textContent =
      "Спасибо. Сообщение отправлено, команда скоро выйдет на связь.";
    form.reset();
  } catch (error) {
    formNote.textContent =
      "Не удалось отправить сообщение. Напишите напрямую на milliardar.media@gmail.com.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = defaultButtonText;
  }
});
