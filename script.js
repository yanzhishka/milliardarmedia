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
let lastHomeFeedSignature = "";
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
  if (!feedTicker) {
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
    renderFeedTicker([]);
  }
}

function renderFeed(posts) {
  renderFeedTicker(posts);
  renderHomeFeed(posts);
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
