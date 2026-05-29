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
  const brand = document.createElement("a");
  const brandImage = document.createElement("img");
  const brandLabel = document.createElement("span");
  const nav = document.createElement("nav");
  const headerBrandImage = siteHeader.querySelector(".brand-mark");

  shell.className = "side-nav-shell";
  shell.setAttribute("aria-label", "Быстрая навигация");
  shell.setAttribute("aria-hidden", "true");

  brand.className = "side-nav-brand";
  brand.href = "/";
  brand.setAttribute("aria-label", "Миллиардар - главная");
  brandImage.src = headerBrandImage?.currentSrc || headerBrandImage?.src || "/assets/logo.png";
  brandImage.alt = "";
  brandImage.setAttribute("aria-hidden", "true");
  brandLabel.textContent = "Меню";
  brand.append(brandImage, brandLabel);

  nav.className = "side-nav";
  nav.setAttribute("aria-label", "Навигация при прокрутке");

  siteNav.querySelectorAll("a").forEach((link) => {
    nav.append(link.cloneNode(true));
  });

  shell.append(brand, nav);

  return shell;
}

function setSideNavInert(sideNav, isInert) {
  if ("inert" in sideNav) {
    sideNav.inert = isInert;
  }
}
