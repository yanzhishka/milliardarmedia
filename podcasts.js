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
    all: "Все",
    total: (n) => `Всего ${n} выпусков.`,
    tagResults: (label, n) => `Рубрика «${label}»: ${n}.`,
    noTagResults: (label) => `В рубрике «${label}» пока пусто.`,
    defaultTitle: "Недельный выпуск",
    noDescription: "Выпуск без описания.",
    videoMissing: "Видео пока не загружено.",
    emptyTitle: "Пока без выпусков.",
    emptyText: "Первый недельный выпуск появится здесь после загрузки.",
    dateTbd: "Дата уточняется",
    play: "Смотреть выпуск",
  },
  en: {
    loading: "Loading episodes…",
    notConnected: "Episodes will appear once the Telegram bot is connected.",
    noneYet: "No episodes yet.",
    all: "All",
    total: (n) => `${n} episodes in total.`,
    tagResults: (label, n) => `Section “${label}”: ${n}.`,
    noTagResults: (label) => `Nothing in “${label}” yet.`,
    defaultTitle: "Weekly episode",
    noDescription: "Episode without a description.",
    videoMissing: "Video not uploaded yet.",
    emptyTitle: "No episodes yet.",
    emptyText: "The first weekly episode will appear here after upload.",
    dateTbd: "Date to be confirmed",
    play: "Watch the episode",
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

  renderPodcastSkeletons();
  podcastStatus.textContent = STR.loading;
  await loadPodcasts();
  window.setInterval(loadPodcasts, PODCAST_REFRESH_INTERVAL);
}

// Build the rubric filter chips from the tags actually used on episodes.
function renderFilterChips() {
  const bar = document.querySelector("[data-podcast-filter]");

  if (!bar) {
    return;
  }

  const tags = collectTags();

  if (activeTag && !tags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase())) {
    activeTag = "";
    activeLabel = "";
  }

  if (!tags.length) {
    bar.replaceChildren();
    bar.hidden = true;
    return;
  }

  bar.hidden = false;

  const makeChip = (label, tag) => {
    const chip = document.createElement("button");

    chip.type = "button";
    chip.className = "filter-chip" + (tag.toLowerCase() === activeTag.toLowerCase() ? " is-active" : "");
    chip.dataset.tag = tag;
    chip.textContent = label;
    chip.addEventListener("click", () => {
      activeTag = tag;
      activeLabel = label;
      lastPodcastSignature = "";
      [...bar.querySelectorAll(".filter-chip")].forEach((other) => other.classList.toggle("is-active", other === chip));
      renderPodcasts();
    });

    return chip;
  };

  const chips = [makeChip(STR.all, "")];

  tags.forEach((tag) => chips.push(makeChip(tag.replace(/^#/, ""), tag)));
  bar.replaceChildren(...chips);
}

function collectTags() {
  const seen = new Map();
  const add = (tag) => {
    const value = String(tag).trim();
    const key = value.toLowerCase();

    if (value && key !== "#podcast" && !seen.has(key)) {
      seen.set(key, value);
    }
  };

  allPodcasts.forEach((podcast) => {
    (Array.isArray(podcast.tags) ? podcast.tags : []).forEach(add);
    (`${podcast.title || ""} ${podcast.description || ""} ${podcast.text || ""}`.match(/#[^\s#]+/g) || []).forEach(add);
  });

  return [...seen.values()];
}

function podcastHasTag(podcast, tag) {
  const key = tag.toLowerCase();

  if (Array.isArray(podcast.tags) && podcast.tags.some((value) => String(value).toLowerCase() === key)) {
    return true;
  }

  return `${podcast.title || ""} ${podcast.description || ""} ${podcast.text || ""}`.toLowerCase().includes(key);
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
    renderFilterChips();
    renderPodcasts();
  } catch (error) {
    allPodcasts = [];
    renderFilterChips();
    renderPodcasts(STR.notConnected);
  }
}

function getDisplayPodcasts() {
  if (!activeTag) {
    return allPodcasts;
  }

  return allPodcasts.filter((podcast) => podcastHasTag(podcast, activeTag));
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

  if (podcast.embedUrl) {
    videoWrap.append(createEmbedPlayer(podcast));
  } else if (podcast.videoUrl) {
    video.src = podcast.videoUrl;
    video.controls = true;
    video.preload = podcast.coverUrl ? "none" : "metadata";
    video.playsInline = true;

    if (podcast.coverUrl) {
      video.poster = podcast.coverUrl;
    }

    videoWrap.append(video);
  } else if (podcast.coverUrl) {
    const cover = document.createElement("img");

    cover.src = podcast.coverUrl;
    cover.alt = podcast.title || STR.defaultTitle;
    cover.loading = "lazy";
    cover.decoding = "async";
    videoWrap.append(cover);
  } else {
    videoWrap.classList.add("is-missing");
    videoWrap.textContent = podcast.videoError || STR.videoMissing;
  }

  card.append(number, videoWrap, meta, title, description);

  return card;
}

// Embedded YouTube/VK player. With a cover, show a lightweight facade and only
// load the heavy iframe when the user clicks play.
function createEmbedPlayer(podcast) {
  if (!podcast.coverUrl) {
    return createEmbedIframe(podcast.embedUrl, false, podcast.title);
  }

  const facade = document.createElement("button");
  const img = document.createElement("img");
  const play = document.createElement("span");

  facade.type = "button";
  facade.className = "podcast-facade";
  facade.setAttribute("aria-label", `${STR.play}: ${podcast.title || STR.defaultTitle}`);
  img.src = podcast.coverUrl;
  img.alt = podcast.title || STR.defaultTitle;
  img.loading = "lazy";
  img.decoding = "async";
  play.className = "podcast-play";
  play.setAttribute("aria-hidden", "true");
  facade.append(img, play);

  facade.addEventListener("click", () => {
    facade.replaceWith(createEmbedIframe(podcast.embedUrl, true, podcast.title));
  });

  return facade;
}

function createEmbedIframe(embedUrl, autoplay, title) {
  const iframe = document.createElement("iframe");
  const src = autoplay ? embedUrl + (embedUrl.includes("?") ? "&" : "?") + "autoplay=1" : embedUrl;

  iframe.src = src;
  iframe.title = title || STR.defaultTitle;
  iframe.loading = "lazy";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  iframe.setAttribute("frameborder", "0");

  return iframe;
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
