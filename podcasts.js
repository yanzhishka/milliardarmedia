const podcastList = document.querySelector("[data-podcast-list]");
const podcastStatus = document.querySelector("[data-podcast-status]");
const revealItems = document.querySelectorAll(".reveal");
const PODCAST_REFRESH_INTERVAL = 45000;

initReveal();
initPodcasts();

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

async function initPodcasts() {
  if (!podcastList || !podcastStatus) {
    return;
  }

  await loadPodcasts();
  window.setInterval(loadPodcasts, PODCAST_REFRESH_INTERVAL);
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
    const podcasts = Array.isArray(data.podcasts) ? data.podcasts : [];

    renderPodcasts(podcasts);
  } catch (error) {
    renderPodcasts([], "Подкасты появятся после подключения Telegram-бота.");
  }
}

function renderPodcasts(podcasts, emptyStatus = "Пока нет выпусков.") {
  if (!podcasts.length) {
    podcastStatus.textContent = emptyStatus;
    podcastList.replaceChildren(createEmptyState());
    return;
  }

  podcastStatus.textContent = `Всего ${podcasts.length} выпусков.`;
  podcastList.replaceChildren(...podcasts.map(createPodcastCard));
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
  title.textContent = podcast.title || "Недельный выпуск";
  meta.dateTime = new Date((podcast.date || Date.now() / 1000) * 1000).toISOString();
  meta.textContent = formatPodcastDate(podcast.date);
  description.textContent = podcast.description || podcast.text || "Выпуск без описания.";

  if (podcast.videoUrl) {
    video.src = podcast.videoUrl;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    videoWrap.append(video);
  } else {
    videoWrap.classList.add("is-missing");
    videoWrap.textContent = podcast.videoError || "Видео пока не загружено.";
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
  title.textContent = "Пока без выпусков.";
  text.textContent = "Первый недельный выпуск появится здесь после загрузки.";

  empty.append(number, title, text);

  return empty;
}

function formatPodcastDate(timestamp) {
  if (!timestamp) {
    return "Дата уточняется";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}
