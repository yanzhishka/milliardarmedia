const CHANNEL_URL = "https://t.me/milliardarmedia";

export function buildReplyKeyboard(admin) {
  const rows = admin
    ? [
        [{ text: "📰 Новость" }, { text: "📝 Черновики" }],
        [{ text: "🎙 Подкасты" }, { text: "⚙️ Управление" }],
        [{ text: "ℹ️ Помощь" }],
      ]
    : [[{ text: "ℹ️ Помощь" }]];

  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Выберите действие",
  };
}

export function buildHomePanel({ admin, name = "" }) {
  const greeting = name ? `, ${escapeHtml(name)}` : "";
  const text = admin
    ? [
        `<b>Редакторская панель${greeting}</b>`,
        "Здесь можно найти позитивную новость, согласовать текст и подготовить пост для ручной пересылки в канал.",
        "Выберите раздел на клавиатуре ниже.",
      ].join("\n\n")
    : [
        `<b>Миллиардар${greeting}</b>`,
        "Новостное агентство без политики. Откройте канал или напишите /whoami, чтобы узнать свой Telegram ID.",
      ].join("\n\n");

  return { text };
}

export function buildNewsPanel() {
  return {
    text: [
      "<b>📰 Новая новость</b>",
      "По кнопке найду один свежий позитивный инфоповод, подготовлю фото и текст в стиле канала, а затем пришлю черновик на согласование.",
    ].join("\n\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "📰 Найти свежую новость", callback_data: "news_request" }],
        [
          { text: "📝 Черновики", callback_data: "menu_drafts" },
          { text: "⬅️ В меню", callback_data: "menu_home" },
        ],
      ],
    },
  };
}

export function buildDraftsPanel(drafts) {
  const items = drafts.slice(0, 6);
  const text = items.length
    ? [
        "<b>📝 Последние черновики</b>",
        items.map(renderDraft).join("\n\n"),
        "Кнопки согласования находятся в самих сообщениях-черновиках.",
      ].join("\n\n")
    : [
        "<b>📝 Черновиков пока нет</b>",
        "Запросите первую идею — бот найдёт свежую позитивную новость и пришлёт её на согласование.",
      ].join("\n\n");

  return {
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: "📰 Найти новость", callback_data: "news_request" }],
        [{ text: "⬅️ В меню", callback_data: "menu_home" }],
      ],
    },
  };
}

export function buildPodcastPanel() {
  return {
    text: [
      "<b>🎙 Подкасты</b>",
      "Отправьте боту видео или ссылку на YouTube/VK с подписью <code>/podcast Название выпуска</code>. Обложку можно добавить командой <code>/cover</code> в ответ на выпуск.",
    ].join("\n\n"),
    reply_markup: backToMenuKeyboard(),
  };
}

export function buildManagePanel() {
  return {
    text: [
      "<b>⚙️ Управление</b>",
      "Проверьте состояние бота, посмотрите список администраторов или откройте расширенные действия.",
    ].join("\n\n"),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔎 Статус", callback_data: "menu_status" },
          { text: "👥 Администраторы", callback_data: "menu_users" },
        ],
        [{ text: "🗑 Удаление и настройки", callback_data: "menu_advanced" }],
        [{ text: "⬅️ В меню", callback_data: "menu_home" }],
      ],
    },
  };
}

export function buildStatusPanel(status) {
  return {
    text: [
      "<b>🔎 Статус</b>",
      `KV: ${status.kv ? "✅" : "❌"}`,
      `Бот: ${status.bot ? "✅" : "❌"}`,
      `Канал: ${escapeHtml(status.channel || "не настроен")}`,
      `Постов на сайте: ${status.posts}`,
      `Выпусков: ${status.podcasts}`,
      `Новости: ${status.newsReady ? "✅ по кнопке" : "⚠️ не настроены"}`,
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔄 Обновить", callback_data: "menu_status" }],
        [{ text: "⬅️ Управление", callback_data: "menu_manage" }],
      ],
    },
  };
}

export function buildUsersPanel({ envIds, dynamicIds }) {
  const envLine = envIds.length ? envIds.join(", ") : "нет";
  const dynamicLine = dynamicIds.length ? dynamicIds.join(", ") : "нет";

  return {
    text: [
      "<b>👥 Администраторы</b>",
      `Из настроек: <code>${escapeHtml(envLine)}</code>`,
      `Добавленные: <code>${escapeHtml(dynamicLine)}</code>`,
      "Добавить: <code>/adduser ID</code>\nУдалить: <code>/removeuser ID</code>",
    ].join("\n\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Управление", callback_data: "menu_manage" }]],
    },
  };
}

export function buildAdvancedPanel() {
  return {
    text: [
      "<b>🗑 Удаление и расширенные команды</b>",
      "Удалить последний пост: <code>/delete</code>\nУдалить пост по номеру: <code>/delete 123</code>\nУдалить только с сайта: <code>/deletesite 123</code>\nУдалить выпуск: <code>/deletepodcast 123</code>",
      "Для каждого удаления бот покажет отдельное подтверждение.",
    ].join("\n\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "⬅️ Управление", callback_data: "menu_manage" }]],
    },
  };
}

export function buildHelpPanel(admin) {
  const adminBlock = admin
    ? "<b>Для редактора</b>\n/news — открыть поиск новости\n/podcast Название — добавить выпуск\n/status — технический статус"
    : "Чтобы стать редактором, попросите администратора добавить ваш Telegram ID.";

  return {
    text: [
      "<b>ℹ️ Помощь</b>",
      "<b>Как сделать пост</b>\n1. Откройте «Новость».\n2. Нажмите «Найти свежую новость».\n3. Нажмите «Править» или «Готово к пересылке».\n4. Перешлите чистое сообщение в канал вручную.",
      adminBlock,
      `<a href="${CHANNEL_URL}">Открыть Telegram-канал</a>`,
    ].join("\n\n"),
    reply_markup: backToMenuKeyboard(),
  };
}

export function isMenuCallback(data) {
  return /^menu_(home|news|drafts|podcast|manage|status|users|advanced|help)$/i.test(String(data || ""));
}

function backToMenuKeyboard() {
  return {
    inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "menu_home" }]],
  };
}

function renderDraft(draft) {
  const status = draftStatus(draft.status);
  const title = String(draft.headline || draft.body || draft.sourceTitle || "Без текста")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  const date = draft.updatedAt || draft.createdAt;
  const dateText = date
    ? new Date(date).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" })
    : "";

  return `${status} <b>${escapeHtml(title)}</b>${dateText ? `\n<code>${escapeHtml(dateText)}</code>` : ""}`;
}

function draftStatus(status) {
  if (status === "pending") return "🟡";
  if (status === "editing") return "🟠";
  if (status === "ready") return "🟢";
  if (status === "skipped") return "⚪️";
  return "⚫️";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
