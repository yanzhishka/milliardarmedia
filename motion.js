/* ============================================================
   Scroll reveal + 3D tilt for cards.
   Exposes window.observeReveal and window.attachTilt for
   dynamically rendered cards. Respects prefers-reduced-motion
   and only tilts on fine pointers.
   ============================================================ */

const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TILT_ENABLED = !REDUCE_MOTION && window.matchMedia("(pointer: fine)").matches;

const revealObserver =
  !REDUCE_MOTION && "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      )
    : null;

window.observeReveal = function observeReveal(elements) {
  const list = Array.isArray(elements) ? elements : [elements];

  list.forEach((element) => {
    if (!element) {
      return;
    }

    element.classList.add("reveal");

    if (revealObserver) {
      revealObserver.observe(element);
    } else {
      element.classList.add("is-visible");
    }
  });
};

function bindTilt(tile) {
  if (!TILT_ENABLED || !tile || tile.dataset.tiltBound === "1") {
    return;
  }

  tile.dataset.tiltBound = "1";
  const max = Number(tile.dataset.tilt) || 4;

  tile.addEventListener("pointermove", (event) => {
    const rect = tile.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    tile.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
    tile.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
  });

  tile.addEventListener("pointerleave", () => {
    tile.style.setProperty("--ry", "0deg");
    tile.style.setProperty("--rx", "0deg");
  });
}

window.attachTilt = function attachTiltList(elements) {
  const list = Array.isArray(elements) ? elements : [elements];

  list.forEach(bindTilt);
};

(function initMotion() {
  const items = document.querySelectorAll(".reveal");

  if (items.length) {
    if (revealObserver) {
      items.forEach((item) => revealObserver.observe(item));
    } else {
      items.forEach((item) => item.classList.add("is-visible"));
    }
  }

  document.querySelectorAll("[data-tilt]").forEach(bindTilt);
})();
