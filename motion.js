/* ============================================================
   Light scroll reveal (newspaper-calm).
   Exposes window.observeReveal for dynamically rendered cards.
   Respects prefers-reduced-motion.
   ============================================================ */

const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// No-op kept so any legacy callers stay safe.
window.attachTilt = function attachTilt() {};

(function initReveal() {
  const items = document.querySelectorAll(".reveal");

  if (!items.length) {
    return;
  }

  if (!revealObserver) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  items.forEach((item) => revealObserver.observe(item));
})();
