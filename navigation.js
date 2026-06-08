const siteHeader = document.querySelector(".site-header");
const siteNav = document.querySelector(".site-nav");
const BACK_TO_TOP_SCROLL_OFFSET = 260;
const SIDE_NAV_QUERY = "(min-width: 1500px)";

initSideNav();
initBackToTop();

function initSideNav() {
  if (!siteHeader || !siteNav) {
    return;
  }

  const sideNav = createSideNav();
  const desktopQuery = window.matchMedia(SIDE_NAV_QUERY);

  document.body.append(sideNav);
  setSideNavInert(sideNav, true);

  const update = () => {
    const shouldShow = desktopQuery.matches;

    document.body.classList.toggle("has-side-nav", shouldShow);
    sideNav.setAttribute("aria-hidden", String(!shouldShow));
    setSideNavInert(sideNav, !shouldShow);
  };

  window.addEventListener("resize", update);

  if ("addEventListener" in desktopQuery) {
    desktopQuery.addEventListener("change", update);
  } else {
    desktopQuery.addListener(update);
  }

  update();
}

function createSideNav() {
  const shell = document.createElement("aside");
  const nav = document.createElement("nav");

  shell.className = "side-nav-shell";
  shell.setAttribute("aria-label", "Быстрая навигация");
  shell.setAttribute("aria-hidden", "true");

  nav.className = "side-nav";
  nav.setAttribute("aria-label", "Навигация при прокрутке");

  siteNav.querySelectorAll("a").forEach((link) => {
    nav.append(link.cloneNode(true));
  });

  shell.append(nav);

  return shell;
}

function setSideNavInert(sideNav, isInert) {
  if ("inert" in sideNav) {
    sideNav.inert = isInert;
  }
}

function initBackToTop() {
  const button = document.createElement("button");
  let ticking = false;

  button.className = "back-to-top";
  button.type = "button";
  button.textContent = "Наверх";
  button.setAttribute("aria-label", "Вернуться наверх");
  button.setAttribute("aria-hidden", "true");
  setSideNavInert(button, true);
  document.body.append(button);

  const update = () => {
    const shouldShow = window.scrollY > BACK_TO_TOP_SCROLL_OFFSET;

    button.classList.toggle("is-visible", shouldShow);
    button.setAttribute("aria-hidden", String(!shouldShow));
    setSideNavInert(button, !shouldShow);
    ticking = false;
  };

  const requestUpdate = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  };

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  update();
}
