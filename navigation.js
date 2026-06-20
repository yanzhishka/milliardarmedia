const BACK_TO_TOP_SCROLL_OFFSET = 320;
const NAV_LANG = (document.documentElement.lang || "ru").slice(0, 2) === "en" ? "en" : "ru";
const NAV_DATE_LOCALE = NAV_LANG === "en" ? "en-GB" : "ru-RU";
const NAV_TEXT =
  NAV_LANG === "en"
    ? { top: "Top", topAria: "Back to top" }
    : { top: "Наверх", topAria: "Вернуться наверх" };

initMastheadDate();
initThemeToggle();
initBackToTop();

function initMastheadDate() {
  const dateEl = document.querySelector("[data-date]");

  if (!dateEl) {
    return;
  }

  dateEl.textContent = new Intl.DateTimeFormat(NAV_DATE_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function initThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");

  if (!toggle) {
    return;
  }

  toggle.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));

  toggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = next;
    toggle.setAttribute("aria-pressed", String(next === "dark"));

    try {
      window.localStorage.setItem("theme", next);
    } catch (error) {
      // Ignore storage limits / private mode.
    }
  });
}

function initBackToTop() {
  const button = document.createElement("button");
  let ticking = false;

  button.className = "back-to-top";
  button.type = "button";
  button.textContent = NAV_TEXT.top;
  button.setAttribute("aria-label", NAV_TEXT.topAria);
  button.setAttribute("aria-hidden", "true");
  document.body.append(button);

  const update = () => {
    const shouldShow = window.scrollY > BACK_TO_TOP_SCROLL_OFFSET;

    button.classList.toggle("is-visible", shouldShow);
    button.setAttribute("aria-hidden", String(!shouldShow));
    ticking = false;
  };

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(update);
    },
    { passive: true },
  );

  update();
}
