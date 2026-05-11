const revealItems = document.querySelectorAll(".reveal");
const form = document.querySelector("#contact-form");
const formNote = document.querySelector(".form-note");
const submitButton = form.querySelector('button[type="submit"]');
const people = document.querySelectorAll(".person");

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    formNote.textContent = "Заполните поля, и мы вернёмся с ответом.";
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
      "Спасибо. Сообщение отправлено, команда скоро свяжется с вами.";
    form.reset();
  } catch (error) {
    formNote.textContent =
      "Не удалось отправить сообщение. Напишите нам напрямую на milliardar.media@gmail.com.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = defaultButtonText;
  }
});
