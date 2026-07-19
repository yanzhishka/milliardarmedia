const CHANNEL_URL = "https://t.me/milliardarmedia";

export function buildReplyKeyboard(admin) {
  const rows = admin
    ? [
        [{ text: "✍️ Написать пост" }],
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
        "Нажмите «✍️ Написать пост»: бот найдёт интересную новость без политики, подготовит фото и текст и отправит результат на согласование.",
      ].join("\n\n")
    : [
        `<b>Миллиардар${greeting}</b>`,
        "Новостное агентство без политики. Откройте канал или напишите /whoami, чтобы узнать свой Telegram ID.",
      ].join("\n\n");

  return { text };
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
  const telegramName = status.telegram.username ? ` @${escapeHtml(status.telegram.username)}` : "";
  const channelName = status.channel.title || status.channel.username || status.channel.id || "не настроен";
  const webhookState = !status.webhook.ok
    ? "❌ нет ответа"
    : status.webhook.lastError
      ? "⚠️ есть ошибка"
      : status.webhook.url
        ? "✅ активен"
        : "⚠️ URL не задан";
  const groqState = !status.groq.configured
    ? "❌ ключ не задан"
    : status.groq.ok
      ? `✅ ${escapeHtml(status.groq.model)}`
      : `❌ ${escapeHtml(status.groq.model)}`;
  const generationReady = status.groq.ok && status.news.runnerConfigured && status.telegram.ok;
  const contentLines = [
    `Постов на сайте: <b>${status.content.posts}</b>`,
    `Последний пост: ${formatStatusDate(status.content.latestPostAt)}`,
    `Фото последнего поста: ${escapeHtml(status.content.latestPostImage || "нет")}`,
    `Подкастов: <b>${status.content.podcasts}</b>`,
    `Последний подкаст: ${formatStatusDate(status.content.latestPodcastAt)}`,
  ];
  const warnings = [
    status.webhook.lastError ? `Webhook: ${status.webhook.lastError}` : "",
    status.telegram.error ? `Telegram: ${status.telegram.error}` : "",
    status.channel.error ? `Канал: ${status.channel.error}` : "",
    status.groq.error ? `Groq: ${status.groq.error}` : "",
    status.kv.error ? `KV: ${status.kv.error}` : "",
  ].filter(Boolean);

  return {
    text: [
      "<b>🩺 Диагностика бота</b>",
      `Проверено: ${formatStatusDate(status.checkedAt)}`,
      [
        "<b>Сервисы</b>",
        `Telegram: ${status.telegram.ok ? "✅ работает" : "❌ недоступен"}${telegramName}`,
        `Webhook: ${webhookState}`,
        `Ожидающих обновлений: <b>${status.webhook.pendingUpdates}</b>`,
        `Groq: ${groqState}`,
        `KV: ${status.kv.ok ? "✅ читается" : "❌ ошибка чтения"}`,
        `Канал: ${status.channel.ok ? "✅" : status.channel.configured ? "❌" : "⚠️"} ${escapeHtml(channelName)}`,
      ].join("\n"),
      [
        "<b>Генератор</b>",
        `Написать пост: ${generationReady ? "✅ готов" : "❌ не готов"}`,
        `Premium-шильдик: ${status.news.premiumEmoji ? "✅ включён" : "⚪️ обычный 📱"}`,
        `Резервные фото Pexels: ${status.news.pexels ? "✅ включены" : "⚪️ только первоисточник"}`,
        `RSS-источники: <b>${status.news.builtInFeeds}</b> встроенных${status.news.customFeeds ? ` + ${status.news.customFeeds} своих` : ""}`,
      ].join("\n"),
      ["<b>Контент</b>", ...contentLines].join("\n"),
      warnings.length ? ["<b>Что требует внимания</b>", ...warnings.map((warning) => `• ${escapeHtml(warning)}`)].join("\n") : "",
    ].filter(Boolean).join("\n\n"),
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔄 Обновить", callback_data: "menu_status" }],
        [{ text: "⬅️ Управление", callback_data: "menu_manage" }],
      ],
    },
  };
}

function formatStatusDate(value) {
  if (!value) {
    return "нет данных";
  }

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "нет данных";
  }

  return escapeHtml(date.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }));
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
    ? "<b>Для редактора</b>\n/news — сразу написать пост\n/podcast Название — добавить выпуск\n/status — технический статус"
    : "Чтобы стать редактором, попросите администратора добавить ваш Telegram ID.";

  return {
    text: [
      "<b>ℹ️ Помощь</b>",
      "<b>Как сделать пост</b>\n1. Нажмите «✍️ Написать пост».\n2. Дождитесь готового варианта.\n3. Нажмите «Править» или «Готово к пересылке».\n4. Перешлите чистое сообщение в канал вручную.",
      adminBlock,
      `<a href="${CHANNEL_URL}">Открыть Telegram-канал</a>`,
    ].join("\n\n"),
    reply_markup: backToMenuKeyboard(),
  };
}

export function isMenuCallback(data) {
  return /^menu_(home|podcast|manage|status|users|advanced|help)$/i.test(String(data || ""));
}

function backToMenuKeyboard() {
  return {
    inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "menu_home" }]],
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
