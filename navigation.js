const siteHeader = document.querySelector(".site-header");
const siteNav = document.querySelector(".site-nav");
const SIDE_NAV_SCROLL_OFFSET = 150;
const SIDE_NAV_QUERY = "(min-width: 1060px)";

initSideNav();

function initSideNav() {
  if (!siteHeader || !siteNav) {
    return;
  }

  const sideNav = createSideNav();
  const desktopQuery = window.matchMedia(SIDE_NAV_QUERY);
  let ticking = false;

  document.body.append(sideNav);
  setSideNavInert(sideNav, true);

  const update = () => {
    const shouldShow = desktopQuery.matches && window.scrollY > SIDE_NAV_SCROLL_OFFSET;

    document.body.classList.toggle("has-side-nav", shouldShow);
    sideNav.setAttribute("aria-hidden", String(!shouldShow));
    setSideNavInert(sideNav, !shouldShow);
    ticking = false;
  };

  const requestUpdate = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  if ("addEventListener" in desktopQuery) {
    desktopQuery.addEventListener("change", requestUpdate);
  } else {
    desktopQuery.addListener(requestUpdate);
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
