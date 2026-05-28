const uploadIntro = document.querySelector("[data-upload-intro]");
const uploadForm = document.querySelector("[data-upload-form]");
const uploadFile = document.querySelector("[data-upload-file]");
const uploadStatus = document.querySelector("[data-upload-status]");
const uploadProgress = document.querySelector("[data-upload-progress]");
const uploadProgressBar = document.querySelector("[data-upload-progress-bar]");
const token = new URLSearchParams(window.location.search).get("token") || "";

initUpload();

async function initUpload() {
  if (!token) {
    setStatus("Ссылка без токена. Сгенерируйте новую через Telegram-бота.", true);
    return;
  }

  try {
    const response = await fetch(`/api/podcast-upload?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
    const data = await readJsonResponse(response, "API загрузки недоступен.");

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Ссылка не найдена");
    }

    renderSession(data.session);
  } catch (error) {
    setStatus(error.message || "Не удалось проверить ссылку.", true);
  }
}

function renderSession(session) {
  uploadIntro.textContent = [
    session.title || "Недельный выпуск",
    session.description ? ` — ${session.description}` : "",
  ].join("");

  if (session.status === "completed") {
    setStatus("Этот выпуск уже загружен и добавлен на страницу подкастов.");
    return;
  }

  if (!session.r2Ready) {
    setStatus("R2 ещё не настроен в Cloudflare. Проверьте переменные и binding.", true);
    return;
  }

  uploadForm.hidden = false;
  setStatus(`Максимальный размер файла: ${session.maxBytesLabel}.`);
  uploadForm.addEventListener("submit", handleUploadSubmit);
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  const file = uploadFile.files?.[0];

  if (!file) {
    setStatus("Выберите видео-файл.", true);
    return;
  }

  uploadForm.querySelector("button").disabled = true;
  setStatus("Готовим прямую загрузку в R2.");

  try {
    const prepared = await prepareUpload(file);

    await uploadToR2(file, prepared);
    setStatus("Проверяем файл и добавляем выпуск на сайт.");

    const completed = await completeUpload();

    uploadForm.hidden = true;
    setProgress(100);
    setStatus(`Готово: «${completed.podcast.title}» опубликован на странице подкастов.`);
  } catch (error) {
    uploadForm.querySelector("button").disabled = false;
    setStatus(error.message || "Загрузка не удалась.", true);
  }
}

async function prepareUpload(file) {
  const response = await fetch("/api/podcast-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      action: "prepare",
      token,
      fileName: file.name,
      contentType: file.type || "video/mp4",
      size: file.size,
    }),
  });
  const data = await readJsonResponse(response, "Не удалось подготовить загрузку.");

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Не удалось подготовить загрузку.");
  }

  return data;
}

function uploadToR2(file, prepared) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    uploadProgress.hidden = false;
    setProgress(0);

    request.open(prepared.method || "PUT", prepared.uploadUrl);

    Object.entries(prepared.headers || {}).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      setProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error(`R2 вернул ошибку ${request.status}. Проверьте CORS bucket-а.`));
    });

    request.addEventListener("error", () => {
      reject(new Error("Браузер не смог загрузить файл в R2. Чаще всего это CORS."));
    });

    request.send(file);
  });
}

async function completeUpload() {
  const response = await fetch("/api/podcast-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      action: "complete",
      token,
    }),
  });
  const data = await readJsonResponse(response, "Файл загрузился, но выпуск не добавился.");

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Файл загрузился, но выпуск не добавился.");
  }

  return data;
}

function setProgress(value) {
  uploadProgressBar.style.width = `${Math.max(0, Math.min(value, 100))}%`;
}

async function readJsonResponse(response, fallbackMessage) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(fallbackMessage);
  }
}

function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle("is-error", isError);
}
