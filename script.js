const revealItems = document.querySelectorAll(".reveal");
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
const feedList = document.querySelector("[data-feed-list]");
const feedStatus = document.querySelector("[data-feed-status]");
const feedTicker = document.querySelector("[data-feed-ticker]");
const feedPanel = document.querySelector("#feed-panel");
const feedOpenTriggers = document.querySelectorAll("[data-feed-open]");
const feedCloseTriggers = document.querySelectorAll("[data-feed-close]");
const canAnimateCursor =
  window.matchMedia("(pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FEED_REFRESH_INTERVAL = 30000;
const TICKER_REPEAT_COUNT = 3;
let latestFeedPosts = [];
let sixtySevenTimer;

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.16,
    rootMargin: "0px 0px -8% 0px",
  },
);

revealItems.forEach((item) => revealObserver.observe(item));

initLazyPortraits();
initTelegramFeed();

if (canAnimateCursor) {
  initCursorSticker();
}

feedOpenTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openFeedPanel();
  });
});

feedCloseTriggers.forEach((trigger) => {
  trigger.addEventListener("click", closeFeedPanel);
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  if (link.matches("[data-feed-open]")) {
    return;
  }

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

  if (event.key === "Escape" && feedPanel?.classList.contains("is-open")) {
    closeFeedPanel();
  }
});

function openFeedPanel() {
  if (!feedPanel) {
    return;
  }

  renderFeedPanel(latestFeedPosts);
  feedPanel.classList.add("is-open");
  feedPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-feed-open");
  feedPanel.querySelector(".feed-panel-close")?.focus();
}

function closeFeedPanel() {
  if (!feedPanel) {
    return;
  }

  feedPanel.classList.remove("is-open");
  feedPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-feed-open");
}

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
  if (!feedTicker && (!feedList || !feedStatus)) {
    return;
  }

  await loadTelegramFeed();
  window.setInterval(loadTelegramFeed, FEED_REFRESH_INTERVAL);
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
    feedStatus.textContent =
      "Лента появится здесь после подключения Telegram webhook в Cloudflare.";
    feedList.replaceChildren();
  }
}

function renderFeed(posts) {
  latestFeedPosts = posts;
  renderFeedTicker(posts);
  renderFeedPanel(posts);
}

function renderFeedTicker(posts) {
  if (!feedTicker) {
    return;
  }

  if (!posts.length) {
    feedTicker.classList.add("is-empty");
    feedTicker.replaceChildren(createTickerItem({ text: "Ждём первые публикации из Telegram" }));
    return;
  }

  feedTicker.classList.remove("is-empty");

  const tickerPosts = Array.from({ length: TICKER_REPEAT_COUNT }, () => posts).flat();
  feedTicker.replaceChildren(...tickerPosts.map(createTickerItem));
}

function renderFeedPanel(posts) {
  if (!feedList || !feedStatus) {
    return;
  }

  feedList.replaceChildren(...posts.map(createFeedCard));

  if (!posts.length) {
    feedStatus.textContent = "Ждём первые публикации из Telegram.";
    return;
  }

  feedStatus.textContent = `Всего ${posts.length} публикаций из Telegram.`;
}

function createTickerItem(post) {
  const item = document.createElement("span");
  const time = document.createElement("span");
  const text = document.createElement("span");
  const date = post.date ? new Date(post.date * 1000) : null;

  item.className = "top-feed-item";
  time.className = "top-feed-time";
  time.textContent = date ? formatFeedDate(date) : "Live";
  text.textContent = getFeedText(post);

  item.append(time, text);

  return item;
}

function createFeedCard(post, index = 0) {
  const card = document.createElement("article");
  const time = document.createElement("time");
  const text = document.createElement("p");
  const link = document.createElement("a");
  const date = post.date ? new Date(post.date * 1000) : new Date();
  const media = createFeedMedia(post);

  card.className = "feed-card";
  card.classList.toggle("has-media", Boolean(media));
  card.classList.toggle("is-featured", index === 0);
  time.dateTime = date.toISOString();
  time.textContent = formatFeedDate(date);
  text.textContent = getFeedText(post);
  link.href = post.link || "https://t.me/milliardarmedia";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Открыть в Telegram";

  card.append(time);

  if (media) {
    card.append(media);
  }

  card.append(text, link);

  return card;
}

function createFeedMedia(post) {
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

function getFeedText(post) {
  if (post.text || post.caption) {
    return post.text || post.caption;
  }

  if (post.imageUrl || post.mediaType === "photo") {
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
