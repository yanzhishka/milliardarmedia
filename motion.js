/* ============================================================
   Premium micro-animations (shared across all pages)
   - scroll reveal (with stagger)
   - word-by-word headline reveal
   - image clip-wipe reveal
   - hairline draw
   - magnetic buttons / links
   - light parallax
   Respects prefers-reduced-motion.
   ============================================================ */

const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let tiltEnabled = false;

const revealObserver =
  !REDUCE_MOTION && "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            revealGroup(entry.target);
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
      )
    : null;

// Public hook so feed.js / podcasts.js can register dynamically created cards.
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

(function initMotion() {
  prepareSplitHeadlines();
  initScrollReveal();

  if (REDUCE_MOTION) {
    return;
  }

  initMagnetic();
  initParallax();

  if (window.matchMedia("(pointer: fine)").matches) {
    initTilt();
    initPointerScene();
  }
})();

/* ---------- split headlines into animatable words ---------- */
function prepareSplitHeadlines() {
  const targets = document.querySelectorAll("[data-split]");

  targets.forEach((target) => {
    const fragments = splitTextNodes(target);

    if (!fragments) {
      return;
    }

    target.classList.add("split-ready", "reveal");
  });
}

function splitTextNodes(element) {
  // Build a flat list of words while preserving <br> breaks.
  const nodes = Array.from(element.childNodes);

  if (!nodes.length) {
    return false;
  }

  const fragment = document.createDocumentFragment();
  let wordIndex = 0;

  nodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
      fragment.append(document.createElement("br"));
      return;
    }

    const text = node.textContent || "";
    const words = text.split(/(\s+)/);

    words.forEach((chunk) => {
      if (!chunk.trim()) {
        fragment.append(document.createTextNode(chunk));
        return;
      }

      const isElement = node.nodeType === Node.ELEMENT_NODE;
      const outer = document.createElement("span");
      const inner = document.createElement("span");

      outer.className = "split-word";
      inner.textContent = chunk;
      inner.style.setProperty("--word-delay", `${wordIndex * 70}ms`);

      if (isElement && node.tagName === "EM") {
        inner.style.fontStyle = "italic";
        inner.style.color = "var(--red)";
      }

      outer.append(inner);
      fragment.append(outer);
      wordIndex += 1;
    });
  });

  element.replaceChildren(fragment);

  return true;
}

/* ---------- scroll reveal ---------- */
function initScrollReveal() {
  const items = document.querySelectorAll(".reveal, .media-reveal, .rule-draw");

  if (!items.length) {
    return;
  }

  if (!revealObserver) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  items.forEach((item) => revealObserver.observe(item));
}

// Stagger direct ".reveal" children of grids for an editorial cascade.
function revealGroup(target) {
  target.classList.add("is-visible");

  const staggerHosts = target.querySelectorAll("[data-stagger]");

  staggerHosts.forEach((host) => {
    Array.from(host.children).forEach((child, index) => {
      child.style.setProperty("--reveal-delay", `${index * 90}ms`);
      child.classList.add("reveal");
      requestAnimationFrame(() => child.classList.add("is-visible"));
    });
  });
}

/* ---------- magnetic buttons ---------- */
function initMagnetic() {
  if (!window.matchMedia("(pointer: fine)").matches) {
    return;
  }

  const magnets = document.querySelectorAll("[data-magnetic], .button");

  magnets.forEach((magnet) => {
    const strength = 0.32;

    magnet.addEventListener("pointermove", (event) => {
      const rect = magnet.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);

      magnet.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    });

    magnet.addEventListener("pointerleave", () => {
      magnet.style.transform = "";
    });
  });
}

/* ---------- 3D tilt + glass sheen ---------- */
function bindTilt(tile) {
  if (!tiltEnabled || !tile || tile.dataset.tiltBound === "1") {
    return;
  }

  tile.dataset.tiltBound = "1";
  const max = Number(tile.dataset.tilt) || 7;

  tile.addEventListener("pointermove", (event) => {
    const rect = tile.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    tile.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
    tile.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
    tile.style.setProperty("--mx", `${px * 100}%`);
    tile.style.setProperty("--my", `${py * 100}%`);
  });

  tile.addEventListener("pointerleave", () => {
    tile.style.setProperty("--ry", "0deg");
    tile.style.setProperty("--rx", "0deg");
  });
}

// Public hook for dynamically created glass tiles (feed.js / podcasts.js).
window.attachTilt = function attachTiltList(elements) {
  const list = Array.isArray(elements) ? elements : [elements];

  list.forEach(bindTilt);
};

function initTilt() {
  tiltEnabled = true;
  document.querySelectorAll("[data-tilt]").forEach(bindTilt);
}

/* ---------- pointer-driven depth parallax (hero orbs) ---------- */
function initPointerScene() {
  const scenes = document.querySelectorAll("[data-pointer-scene]");

  scenes.forEach((scene) => {
    const layers = scene.querySelectorAll("[data-depth]");

    if (!layers.length) {
      return;
    }

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let raf = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      layers.forEach((layer) => {
        const depth = Number(layer.dataset.depth) || 12;

        layer.style.transform = `translate3d(${(currentX * depth).toFixed(1)}px, ${(currentY * depth).toFixed(1)}px, 0)`;
      });

      raf = Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001
        ? requestAnimationFrame(render)
        : 0;
    };

    scene.addEventListener("pointermove", (event) => {
      const rect = scene.getBoundingClientRect();

      targetX = (event.clientX - rect.left) / rect.width - 0.5;
      targetY = (event.clientY - rect.top) / rect.height - 0.5;

      if (!raf) {
        raf = requestAnimationFrame(render);
      }
    });

    scene.addEventListener("pointerleave", () => {
      targetX = 0;
      targetY = 0;

      if (!raf) {
        raf = requestAnimationFrame(render);
      }
    });
  });
}

/* ---------- light parallax ---------- */
function initParallax() {
  const layers = document.querySelectorAll("[data-parallax]");

  if (!layers.length) {
    return;
  }

  let ticking = false;

  const update = () => {
    const viewportCenter = window.innerHeight / 2;

    layers.forEach((layer) => {
      const speed = Number(layer.dataset.parallax) || 0.08;
      const rect = layer.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - viewportCenter) * speed;

      layer.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    });

    ticking = false;
  };

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}
