const podcastList = document.querySelector("[data-podcast-list]");
const podcastStatus = document.querySelector("[data-podcast-status]");
const PODCAST_REFRESH_INTERVAL = 45000;
const LANG = (document.documentElement.lang || "ru").slice(0, 2) === "en" ? "en" : "ru";
const DATE_LOCALE = LANG === "en" ? "en-GB" : "ru-RU";
const STR = {
  ru: {
    loading: "Загружаем выпуски…",
    notConnected: "Выпуски появятся после подключения Telegram-бота.",
    noneYet: "Пока нет выпусков.",
    total: (n) => `Всего ${n} выпусков.`,
    tagResults: (label, n) => `Рубрика «${label}»: ${n}.`,
    noTagResults: (label) => `В рубрике «${label}» пока пусто.`,
    defaultTitle: "Недельный выпуск",
    noDescription: "Выпуск без описания.",
    videoMissing: "Видео пока не загружено.",
    emptyTitle: "Пока без выпусков.",
    emptyText: "Первый недельный выпуск появится здесь после загрузки.",
    dateTbd: "Дата уточняется",
  },
  en: {
    loading: "Loading episodes…",
    notConnected: "Episodes will appear once the Telegram bot is connected.",
    noneYet: "No episodes yet.",
    total: (n) => `${n} episodes in total.`,
    tagResults: (label, n) => `Section “${label}”: ${n}.`,
    noTagResults: (label) => `Nothing in “${label}” yet.`,
    defaultTitle: "Weekly episode",
    noDescription: "Episode without a description.",
    videoMissing: "Video not uploaded yet.",
    emptyTitle: "No episodes yet.",
    emptyText: "The first weekly episode will appear here after upload.",
    dateTbd: "Date to be confirmed",
  },
}[LANG];
let lastPodcastSignature = "";
let allPodcasts = [];
let activeTag = "";
let activeLabel = "";

initPodcasts();

async function initPodcasts() {
  if (!podcastList || !podcastStatus) {
    return;
  }

  initPodcastFilter();
  renderPodcastSkeletons();
  podcastStatus.textContent = STR.loading;
  await loadPodcasts();
  window.setInterval(loadPodcasts, PODCAST_REFRESH_INTERVAL);
}

function initPodcastFilter() {
  const bar = document.querySelector("[data-podcast-filter]");

  if (!bar) {
    return;
  }

  const chips = [...bar.querySelectorAll(".filter-chip")];

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      activeTag = chip.dataset.tag || "";
      activeLabel = chip.textContent.trim();
      lastPodcastSignature = "";
      chips.forEach((other) => other.classList.toggle("is-active", other === chip));
      renderPodcasts();
    });
  });
}

function renderPodcastSkeletons(count = 2) {
  const items = Array.from({ length: count }, () => {
    const card = document.createElement("article");
    const video = document.createElement("div");
    const media = document.createElement("span");
    const kicker = document.createElement("span");
    const title = document.createElement("span");
    const text = document.createElement("span");

    card.className = "podcast-card skeleton";
    video.className = "podcast-video";
    media.className = "skel";
    media.style.cssText = "position:absolute;inset:0;border-radius:inherit";
    video.append(media);
    kicker.className = "skel skel-line is-kicker";
    title.className = "skel skel-line is-lg";
    text.className = "skel skel-line w-90";
    card.append(video, kicker, title, text);

    return card;
  });

  podcastList.replaceChildren(...items);
}

async function loadPodcasts() {
  try {
    const response = await fetch("/api/podcasts", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Podcast endpoint is not ready");
    }

    const data = await response.json();

    allPodcasts = Array.isArray(data.podcasts) ? data.podcasts : [];
    renderPodcasts();
  } catch (error) {
    allPodcasts = [];
    renderPodcasts(STR.notConnected);
  }
}

function getDisplayPodcasts() {
  if (!activeTag) {
    return allPodcasts;
  }

  const tag = activeTag.toLowerCase();

  return allPodcasts.filter((podcast) =>
    `${podcast.title || ""} ${podcast.description || ""} ${podcast.text || ""}`.toLowerCase().includes(tag),
  );
}

function renderPodcasts(emptyStatus = "") {
  const podcasts = getDisplayPodcasts();

  if (!podcasts.length) {
    podcastStatus.textContent =
      emptyStatus || (activeTag ? STR.noTagResults(activeLabel) : STR.noneYet);

    if (lastPodcastSignature !== "empty") {
      lastPodcastSignature = "empty";
      podcastList.replaceChildren(createEmptyState());
    }

    return;
  }

  podcastStatus.textContent = activeTag
    ? STR.tagResults(activeLabel, podcasts.length)
    : STR.total(podcasts.length);

  const signature =
    `${activeTag}|` + podcasts.map((podcast) => `${podcast.id || ""}:${podcast.videoUrl || ""}`).join("|");

  if (signature === lastPodcastSignature) {
    return;
  }

  lastPodcastSignature = signature;

  const cards = podcasts.map(createPodcastCard);
  podcastList.replaceChildren(...cards);

  if (typeof window.observeReveal === "function") {
    cards.forEach((card, index) => {
      card.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 80}ms`);
    });
    window.observeReveal(cards);
  }
}

function createPodcastCard(podcast, index) {
  const card = document.createElement("article");
  const number = document.createElement("span");
  const title = document.createElement("h3");
  const meta = document.createElement("time");
  const description = document.createElement("p");
  const videoWrap = document.createElement("div");
  const video = document.createElement("video");

  card.className = "podcast-card";
  number.className = "podcast-number";
  videoWrap.className = "podcast-video";
  number.textContent = String(index + 1).padStart(2, "0");
  title.textContent = podcast.title || STR.defaultTitle;
  meta.dateTime = new Date((podcast.date || Date.now() / 1000) * 1000).toISOString();
  meta.textContent = formatPodcastDate(podcast.date);
  description.textContent = podcast.description || podcast.text || STR.noDescription;

  if (podcast.videoUrl) {
    video.src = podcast.videoUrl;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    videoWrap.append(video);
  } else {
    videoWrap.classList.add("is-missing");
    videoWrap.textContent = podcast.videoError || STR.videoMissing;
  }

  card.append(number, videoWrap, meta, title, description);

  return card;
}

function createEmptyState() {
  const empty = document.createElement("article");
  const number = document.createElement("span");
  const title = document.createElement("h3");
  const text = document.createElement("p");

  empty.className = "podcast-empty";
  number.textContent = "00";
  title.textContent = STR.emptyTitle;
  text.textContent = STR.emptyText;

  empty.append(number, title, text);

  return empty;
}

function formatPodcastDate(timestamp) {
  if (!timestamp) {
    return STR.dateTbd;
  }

  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}
