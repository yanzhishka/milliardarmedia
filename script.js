const revealItems = document.querySelectorAll(".reveal");
const form = document.querySelector("#contact-form");
const formNote = document.querySelector(".form-note");
const submitButton = form.querySelector('button[type="submit"]');
const people = document.querySelectorAll(".person");
const rickrollModal = document.querySelector("#rickroll-modal");
const rickrollVideo = rickrollModal.querySelector("video");
const rickrollClose = rickrollModal.querySelector(".rickroll-close");
const commandForm = document.querySelector("#command-console");
const commandInput = document.querySelector("#command-input");
const consoleOutput = document.querySelector(".console-output");
const formatButtons = document.querySelectorAll(".format-button");
const briefPanel = document.querySelector(".brief-panel");
const briefKicker = document.querySelector("#brief-kicker");
const briefTitle = document.querySelector("#brief-title");
const briefText = document.querySelector("#brief-text");
const briefTags = document.querySelector("#brief-tags");
const mixerRanges = document.querySelectorAll(".mixer-range");
const headlineOutput = document.querySelector("#headline-output");
const lazyPortraits = document.querySelectorAll(".portrait[data-src]");
const canAnimateCursor =
  window.matchMedia("(pointer: fine)").matches &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let sixtySevenTimer;
let activeFormat = "investigation";

const formatContent = {
  investigation: {
    kicker: "Тема + факты",
    title: "Материал",
    text: "Факты, контекст, ясный текст.",
    tags: ["факты", "контекст", "редактура"],
  },
  interview: {
    kicker: "Герой + разговор",
    title: "Интервью",
    text: "Коротко, живо, по делу.",
    tags: ["диалог", "герой", "смысл"],
  },
  video: {
    kicker: "Съёмка + монтаж",
    title: "Видео",
    text: "Кадр, голос, ритм.",
    tags: ["кадр", "монтаж", "ритм"],
  },
  special: {
    kicker: "Идея + упаковка",
    title: "Спецпроект",
    text: "Одна идея, цельная форма.",
    tags: ["серия", "подача", "публикация"],
  },
};

const headlineBank = {
  investigation: {
    sharp: "Главное по теме.",
    funny: "Серьёзно, но живо.",
    dramatic: "Деталь меняет всё.",
    forensic: "Факты и контекст.",
    satire: "Ясно, без пафоса.",
    noir: "Материал с характером.",
    human: "Человек за событием.",
    absurd: "Сложное простым языком.",
    balanced: "История, которую хочется дочитать.",
  },
  interview: {
    sharp: "Разговор по делу.",
    funny: "Без деревянных вопросов.",
    dramatic: "Ответ, который меняет тему.",
    forensic: "Голос и детали.",
    satire: "Серьёзно, не скучно.",
    noir: "Интервью с настроением.",
    human: "Герой и его опыт.",
    absurd: "Один вопрос открывает всё.",
    balanced: "Когда героя слушают.",
  },
  video: {
    sharp: "Видео, которое держит.",
    funny: "Кадр без шума.",
    dramatic: "История в ритме.",
    forensic: "Детали объясняют.",
    satire: "Лёгко, но точно.",
    noir: "Сдержанная атмосфера.",
    human: "Герой, место, голос.",
    absurd: "Идея оживает в монтаже.",
    balanced: "Тема в памяти.",
  },
  special: {
    sharp: "Тема в системе.",
    funny: "Большая идея легко.",
    dramatic: "Серия с усилением.",
    forensic: "Сложное по частям.",
    satire: "Лёгкая упаковка.",
    noir: "Серия с характером.",
    human: "Люди и контекст.",
    absurd: "Факты сложились.",
    balanced: "Сильный спецпроект.",
  },
};

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.16,
    rootMargin: "0px 0px -8% 0px",
  },
);

revealItems.forEach((item) => revealObserver.observe(item));

initLazyPortraits();

if (canAnimateCursor) {
  initCursorSticker();
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

people.forEach((person) => {
  person.addEventListener("toggle", () => {
    if (!person.open) {
      return;
    }

    people.forEach((otherPerson) => {
      if (otherPerson !== person) {
        otherPerson.open = false;
      }
    });
  });
});

formatButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFormat = button.dataset.format;

    formatButtons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    updateBrief(activeFormat);
    updateHeadline();
  });
});

mixerRanges.forEach((range) => {
  range.addEventListener("input", () => {
    range.nextElementSibling.value = range.value;
    updateHeadline();
  });
});

commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  executeConsoleCommand();
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  executeConsoleCommand();
});

function executeConsoleCommand() {
  const command = commandInput.value.trim().toLowerCase();
  commandInput.value = "";

  if (!command) {
    consoleOutput.textContent = "";
    return;
  }

  runConsoleCommand(command);
}

rickrollClose.addEventListener("click", closeRickroll);

rickrollModal.addEventListener("click", (event) => {
  if (event.target === rickrollModal) {
    closeRickroll();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && rickrollModal.classList.contains("is-open")) {
    closeRickroll();
  }
});

function openRickroll() {
  rickrollModal.classList.add("is-open");
  rickrollModal.setAttribute("aria-hidden", "false");

  if (!rickrollVideo.getAttribute("src")) {
    rickrollVideo.src = rickrollVideo.dataset.src;
    rickrollVideo.load();
  }

  rickrollVideo.currentTime = 0;
  rickrollVideo.play().catch(() => {
    rickrollVideo.controls = true;
  });
  rickrollClose.focus();
}

function closeRickroll() {
  rickrollModal.classList.remove("is-open");
  rickrollModal.setAttribute("aria-hidden", "true");
  rickrollVideo.pause();
  rickrollVideo.currentTime = 0;
  rickrollVideo.removeAttribute("src");
  rickrollVideo.load();
}

function updateBrief(format) {
  const content = formatContent[format];

  briefPanel.classList.add("is-changing");
  window.setTimeout(() => {
    briefKicker.textContent = content.kicker;
    briefTitle.textContent = content.title;
    briefText.textContent = content.text;
    briefTags.innerHTML = content.tags.map((tag) => `<span>${tag}</span>`).join("");
    briefPanel.classList.remove("is-changing");
  }, 140);
}

function updateHeadline() {
  const facts = Number(document.querySelector('[name="facts"]').value);
  const humor = Number(document.querySelector('[name="humor"]').value);
  const drama = Number(document.querySelector('[name="drama"]').value);
  const options = headlineBank[activeFormat];
  const nextHeadline = pickHeadline(options, facts, humor, drama);

  headlineOutput.classList.add("is-changing");
  window.setTimeout(() => {
    headlineOutput.textContent = nextHeadline;
    headlineOutput.classList.remove("is-changing");
  }, 110);
}

function pickHeadline(options, facts, humor, drama) {
  if (facts === 100 && humor === 100 && drama === 100) {
    return options.absurd;
  }

  if (facts >= 75 && humor >= 75 && drama >= 75) {
    return options.absurd;
  }

  if (facts >= 75 && humor >= 75) {
    return options.satire;
  }

  if (facts >= 75 && drama >= 75) {
    return options.forensic;
  }

  if (humor >= 75 && drama >= 75) {
    return options.noir;
  }

  if (facts <= 25 && humor <= 25 && drama <= 25) {
    return options.human;
  }

  if (facts >= 75 && facts >= humor && facts >= drama) {
    return options.sharp;
  }

  if (humor >= 75 && humor >= facts && humor >= drama) {
    return options.funny;
  }

  if (drama >= 75 && drama >= facts && drama >= humor) {
    return options.dramatic;
  }

  if (facts <= 25 && drama >= 50) {
    return options.human;
  }

  if (humor <= 25 && facts >= 50) {
    return options.forensic;
  }

  return options.balanced;
}

function runConsoleCommand(command) {
  if (command === "rickroll") {
    consoleOutput.textContent = "открываем медиафайл";
    openRickroll();
    return;
  }

  if (command === "67") {
    consoleOutput.textContent = "команда 67 активирована";
    triggerSixtySeven();
    return;
  }

  consoleOutput.textContent = `команда не найдена: ${command}`;
}

function triggerSixtySeven() {
  let badge = document.querySelector(".sixty-seven-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.className = "sixty-seven-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "67";
    document.body.append(badge);
  }

  document.body.classList.remove("is-sixty-seven");
  window.requestAnimationFrame(() => {
    document.body.classList.add("is-sixty-seven");
  });

  window.clearTimeout(sixtySevenTimer);
  sixtySevenTimer = window.setTimeout(() => {
    document.body.classList.remove("is-sixty-seven");
  }, 1500);
}

function initLazyPortraits() {
  if (!lazyPortraits.length) {
    return;
  }

  const loadPortrait = (image) => {
    const fallback = image.dataset.fallback;

    if (fallback) {
      image.addEventListener(
        "error",
        () => {
          if (image.src.endsWith(fallback)) {
            return;
          }

          image.src = fallback;
        },
        { once: true },
      );
    }

    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  };

  if (!("IntersectionObserver" in window)) {
    lazyPortraits.forEach(loadPortrait);
    return;
  }

  const portraitObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        loadPortrait(entry.target);
        portraitObserver.unobserve(entry.target);
      });
    },
    {
      rootMargin: "160px 0px",
      threshold: 0.01,
    },
  );

  lazyPortraits.forEach((image) => portraitObserver.observe(image));
}

function initCursorSticker() {
  const sticker = document.createElement("div");
  const leftEye = document.createElement("span");
  const rightEye = document.createElement("span");
  const smile = document.createElement("span");
  let frameId = 0;
  let hideTimer = 0;
  let x = -80;
  let y = -80;
  let rotation = 0;

  sticker.className = "cursor-sticker";
  leftEye.className = "cursor-sticker-eye";
  rightEye.className = "cursor-sticker-eye";
  smile.className = "cursor-sticker-smile";
  sticker.setAttribute("aria-hidden", "true");
  sticker.append(leftEye, rightEye, smile);
  document.body.append(sticker);

  window.addEventListener(
    "pointermove",
    (event) => {
      x = event.clientX + 18;
      y = event.clientY + 14;
      rotation = Math.sin(event.clientX * 0.015) * 7;
      sticker.classList.add("is-visible");

      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        sticker.classList.remove("is-visible");
      }, 1200);

      if (!frameId) {
        frameId = requestAnimationFrame(updateCursorSticker);
      }
    },
    { passive: true },
  );

  window.addEventListener("pointerleave", () => {
    sticker.classList.remove("is-visible");
  });

  function updateCursorSticker() {
    frameId = 0;
    sticker.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    formNote.textContent = "Заполните поля, чтобы мы могли ответить.";
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);
  const defaultButtonText = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Отправляем";
  formNote.textContent = "";

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Form submission failed");
    }

    formNote.textContent =
      "Спасибо. Сообщение отправлено, команда скоро выйдет на связь.";
    form.reset();
  } catch (error) {
    formNote.textContent =
      "Не удалось отправить сообщение. Напишите напрямую на milliardar.media@gmail.com.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = defaultButtonText;
  }
});
