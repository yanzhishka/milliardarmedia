const POSTS_KEY = "telegram_posts";
const PODCASTS_KEY = "telegram_podcasts";
const IMAGE_KEY_PREFIX = "telegram_post_image:";
const PODCAST_VIDEO_KEY_PREFIX = "telegram_podcast_video:";
const PENDING_ACTION_KEY_PREFIX = "telegram_pending_action:";
const ADMINS_KEY = "telegram_admin_ids";
const MAX_POSTS = 90;
const MAX_PODCASTS = 24;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PODCAST_VIDEO_BYTES = 20 * 1024 * 1024;
const DEFAULT_FEED_RESET_AT = 1779913144;
const DELETE_CONFIRM_TTL_SECONDS = 10 * 60;

export async function onRequestPost({ request, env }) {
  if (!env.POSTS_KV) {
    return jsonResponse(
      { ok: false, error: "Missing Cloudflare KV binding: POSTS_KV" },
      { status: 500 },
    );
  }

  if (!isValidTelegramSecret(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized webhook" }, { status: 401 });
  }

  let update;

  try {
    update = await request.json();
  } catch (error) {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, env);
  }

  if (update.message) {
    return handleBotMessage(update.message, env);
  }

  const channelPost = update.channel_post || update.edited_channel_post;

  if (!channelPost) {
    return jsonResponse({ ok: true, ignored: true });
  }

  if (!isAllowedChannel(channelPost.chat, env)) {
    return jsonResponse({ ok: true, ignored: true, reason: "channel_mismatch" });
  }

  if (isCoverPost(channelPost)) {
    return handleSetCover(channelPost, env);
  }

  if (isPodcastPost(channelPost)) {
    const { podcast } = await storePodcast(channelPost, env);

    return jsonResponse({ ok: true, storedPodcast: podcast.id });
  }

  const posts = await readPosts(env);
  const post = await normalizePost(channelPost, env);
  const nextPosts = upsertPost(posts, post);
  const staleImageKeys = collectStaleImageKeys(posts, nextPosts);

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));
  await deletePostImages(env, staleImageKeys);

  return jsonResponse({ ok: true, stored: post.id, mediaGroupId: post.mediaGroupId || "" });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readPosts(env) {
  const posts = await env.POSTS_KV.get(POSTS_KEY, { type: "json" });

  return Array.isArray(posts) ? collapsePostAlbums(filterVisiblePosts(posts, env)) : [];
}

async function readPodcasts(env) {
  const podcasts = await env.POSTS_KV.get(PODCASTS_KEY, { type: "json" });

  return Array.isArray(podcasts) ? filterVisiblePodcasts(podcasts, env) : [];
}

async function handleBotMessage(message, env) {
  const text = (message.text || message.caption || "").trim();

  if (isCommand(text, "help") || isCommand(text, "commands")) {
    return handleHelpCommand(message, env);
  }

  if (isCommand(text, "whoami")) {
    await replyToBotMessage(env, message, `Ваш Telegram ID: ${message.from?.id || "неизвестен"}`);
    return jsonResponse({ ok: true, command: "whoami" });
  }

  if (isCommand(text, "adduser")) {
    return handleAddUserCommand(message, env, text);
  }

  if (isCommand(text, "removeuser") || isCommand(text, "deluser")) {
    return handleRemoveUserCommand(message, env, text);
  }

  if (isCommand(text, "users")) {
    return handleListUsersCommand(message, env);
  }

  if (isCommand(text, "podcast")) {
    return handlePodcastCommand(message, env, text);
  }

  if (isCommand(text, "cover")) {
    return handleSetCover(message, env);
  }

  if (isCommand(text, "deletepodcast")) {
    return handleDeletePodcastCommand(message, env, text);
  }

  if (isCommand(text, "deletesite")) {
    return handleDeleteSiteCommand(message, env, text);
  }

  if (isCommand(text, "status")) {
    return handleStatusCommand(message, env);
  }

  if (isCommand(text, "confirmdelete")) {
    return handleConfirmDeleteCommand(message, env);
  }

  if (isCommand(text, "canceldelete") || isCommand(text, "cancel")) {
    return handleCancelDeleteCommand(message, env);
  }

  if (isCommand(text, "delete")) {
    return handleDeleteCommand(message, env, text);
  }

  return jsonResponse({ ok: true, ignored: true });
}

async function handleHelpCommand(message, env) {
  const admin = await isAdminMessage(message, env);
  const publicLines = [
    "Команды бота:",
    "/help — показать эту памятку.",
    "/whoami — узнать свой Telegram ID.",
  ];
  const adminLines = [
    "",
    "Команды администратора:",
    "/status — проверить KV, канал, ленту и подкасты.",
    "/users — показать администраторов ленты.",
    "/adduser 123456789 — добавить администратора по Telegram ID.",
    "/removeuser 123456789 — убрать добавленного администратора.",
    "/delete — подготовить удаление последнего поста из Telegram и с сайта.",
    "/delete 123 — подготовить удаление поста по номеру сообщения.",
    "/delete ссылка — подготовить удаление поста по ссылке Telegram.",
    "/deletesite 123 — подготовить удаление поста только с сайта.",
    "/deletesite ссылка — подготовить удаление поста по ссылке только с сайта.",
    "/deletepodcast — подготовить удаление последнего выпуска со страницы подкастов.",
    "/deletepodcast 123 — подготовить удаление выпуска по номеру сообщения.",
    "/confirmdelete — запасное подтверждение, если кнопка не сработала.",
    "/canceldelete — отменить подготовленное удаление, если кнопка потерялась.",
    "/podcast Название — отправьте видео или ссылку на YouTube/VK с этой подписью, чтобы добавить выпуск.",
    "/cover — ответьте этой командой на выпуск, приложив фото, чтобы задать обложку.",
    "",
    "После /delete, /deletesite и /deletepodcast бот пришлёт кнопки подтверждения.",
    "Важно: /deletesite чистит пост и файлы только на сайте, но оставляет сообщение в Telegram.",
    "Важно: /deletepodcast чистит карточку и файл на сайте, но не удаляет сообщение в Telegram.",
  ];

  await replyToBotMessage(env, message, (admin ? [...publicLines, ...adminLines] : publicLines).join("\n"));

  return jsonResponse({ ok: true, command: "help", admin });
}

async function handleDeleteCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам ленты.");
    return jsonResponse({ ok: true, command: "delete", denied: true });
  }

  const posts = await readPosts(env);
  const deleteTarget = parseDeleteTarget(text, "delete");
  let messageId = deleteTarget.messageId;

  if (!deleteTarget.raw && posts.length) {
    messageId = posts[0].messageId;
  }

  if (!deleteTarget.raw && !posts.length) {
    await replyToBotMessage(env, message, "В ленте сайта пока нет постов.");
    return jsonResponse({ ok: true, command: "delete", empty: true });
  }

  if (deleteTarget.raw && !messageId) {
    await replyToBotMessage(
      env,
      message,
      "Формат: /delete, /delete 123 или /delete https://t.me/milliardarmedia/123",
    );
    return jsonResponse({ ok: true, command: "delete", error: "missing_message_id" });
  }

  const action = await savePendingAction(env, message, {
    type: "delete_post",
    messageId,
  });

  if (!action) {
    await replyToBotMessage(env, message, "Не смог сохранить подтверждение. Попробуйте ещё раз.");
    return jsonResponse({ ok: true, command: "delete", error: "pending_action_failed" });
  }

  await replyToBotMessage(
    env,
    message,
    [
      `Пост ${messageId} подготовлен к удалению из Telegram и с сайта.`,
      "Подтвердите действие кнопкой ниже.",
      "Команда действует 10 минут.",
    ].join("\n"),
    { reply_markup: buildDeleteKeyboard(action.actionId) },
  );

  return jsonResponse({ ok: true, command: "delete", pending: true, messageId });
}

async function handleDeleteSiteCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам ленты.");
    return jsonResponse({ ok: true, command: "deletesite", denied: true });
  }

  const posts = await readPosts(env);
  const deleteTarget = parseDeleteTarget(text, "deletesite");
  const messageId = deleteTarget.messageId;

  if (!posts.length) {
    await replyToBotMessage(env, message, "В ленте сайта пока нет постов.");
    return jsonResponse({ ok: true, command: "deletesite", empty: true });
  }

  if (!deleteTarget.raw || !messageId) {
    await replyToBotMessage(
      env,
      message,
      "Формат: /deletesite 123 или /deletesite https://t.me/milliardarmedia/123",
    );
    return jsonResponse({ ok: true, command: "deletesite", error: "missing_message_id" });
  }

  const action = await savePendingAction(env, message, {
    type: "delete_site_post",
    messageId,
  });

  if (!action) {
    await replyToBotMessage(env, message, "Не смог сохранить подтверждение. Попробуйте ещё раз.");
    return jsonResponse({ ok: true, command: "deletesite", error: "pending_action_failed" });
  }

  await replyToBotMessage(
    env,
    message,
    [
      `Пост ${messageId} подготовлен к удалению только с сайта.`,
      "В Telegram сообщение останется.",
      "Подтвердите действие кнопкой ниже.",
      "Команда действует 10 минут.",
    ].join("\n"),
    { reply_markup: buildDeleteKeyboard(action.actionId) },
  );

  return jsonResponse({ ok: true, command: "deletesite", pending: true, messageId });
}

async function executeDeletePost(message, env, messageId) {
  const posts = await readPosts(env);
  const chatId = getChannelChatId(env);
  const telegramResult = chatId
    ? await callTelegram(env, "deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      })
    : { ok: false, description: "TELEGRAM_CHANNEL_ID или TELEGRAM_CHANNEL_USERNAME не настроен" };

  const nextPosts = removePost(posts, messageId);
  const deletedPosts = posts.filter((post) => !nextPosts.some((nextPost) => nextPost.id === post.id));

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));
  await deletePostImages(env, deletedPosts);
  await replyToBotMessage(env, message, buildDeleteReply(messageId, telegramResult, posts, nextPosts));

  return jsonResponse({
    ok: true,
    command: "confirmdelete",
    action: "delete",
    messageId,
    telegramDeleted: telegramResult.ok,
    siteDeleted: posts.length !== nextPosts.length,
  });
}

async function executeDeleteSitePost(message, env, messageId) {
  const posts = await readPosts(env);
  const nextPosts = removePost(posts, messageId);
  const deletedPosts = posts.filter((post) => !nextPosts.some((nextPost) => nextPost.id === post.id));
  const siteDeleted = posts.length !== nextPosts.length;

  await env.POSTS_KV.put(POSTS_KEY, JSON.stringify(nextPosts));
  await deletePostImages(env, deletedPosts);
  await replyToBotMessage(
    env,
    message,
    siteDeleted
      ? `Пост ${messageId} удалён только с сайта. В Telegram он остался.`
      : `Пост ${messageId} не найден в ленте сайта.`,
  );

  return jsonResponse({
    ok: true,
    command: "confirmdelete",
    action: "deletesite",
    messageId,
    siteDeleted,
  });
}

async function handleConfirmDeleteCommand(message, env) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "confirmdelete", denied: true });
  }

  const action = await readPendingAction(env, message);

  if (!action) {
    await replyToBotMessage(
      env,
      message,
      "Нет удаления для подтверждения. Сначала используйте /delete, /deletesite или /deletepodcast.",
    );
    return jsonResponse({ ok: true, command: "confirmdelete", empty: true });
  }

  let response;

  try {
    if (action.type === "delete_post") {
      response = await executeDeletePost(message, env, action.messageId);
    } else if (action.type === "delete_site_post") {
      response = await executeDeleteSitePost(message, env, action.messageId);
    } else if (action.type === "delete_podcast") {
      response = await executeDeletePodcast(message, env, action.messageId);
    } else {
      await replyToBotMessage(env, message, "Не понял сохранённое действие. Попробуйте команду заново.");
      response = jsonResponse({ ok: true, command: "confirmdelete", error: "unknown_action" });
    }
  } finally {
    await clearPendingAction(env, message);
  }

  return response;
}

async function handleCallbackQuery(query, env) {
  const data = String(query.data || "");
  const match = data.match(/^delete_(confirm|cancel):([a-z0-9_-]+)$/i);

  if (!match) {
    await answerCallbackQuery(env, query, "Неизвестная кнопка.");
    return jsonResponse({ ok: true, ignored: true, reason: "unknown_callback" });
  }

  const [, actionName, actionId] = match;
  const message = messageFromCallbackQuery(query);

  if (!(await isAdminMessage(message, env))) {
    await answerCallbackQuery(env, query, "Команда доступна только администраторам.", true);
    return jsonResponse({ ok: true, command: "callback_delete", denied: true });
  }

  const action = await readPendingAction(env, message);

  if (!action || action.actionId !== actionId) {
    await answerCallbackQuery(env, query, "Это подтверждение уже не актуально.", true);
    await removeCallbackButtons(env, query);
    return jsonResponse({ ok: true, command: "callback_delete", stale: true });
  }

  if (actionName.toLowerCase() === "cancel") {
    await clearPendingAction(env, message);
    await answerCallbackQuery(env, query, "Удаление отменено.");
    await editCallbackMessage(env, query, "Удаление отменено.");
    return jsonResponse({ ok: true, command: "callback_delete", cancelled: true });
  }

  await answerCallbackQuery(env, query, "Удаляю...");

  let response;

  try {
    if (action.type === "delete_post") {
      response = await executeDeletePost(message, env, action.messageId);
    } else if (action.type === "delete_site_post") {
      response = await executeDeleteSitePost(message, env, action.messageId);
    } else if (action.type === "delete_podcast") {
      response = await executeDeletePodcast(message, env, action.messageId);
    } else {
      await replyToBotMessage(env, message, "Не понял сохранённое действие. Попробуйте команду заново.");
      response = jsonResponse({ ok: true, command: "callback_delete", error: "unknown_action" });
    }
  } finally {
    await clearPendingAction(env, message);
    await removeCallbackButtons(env, query);
  }

  return response;
}

async function handleCancelDeleteCommand(message, env) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "canceldelete", denied: true });
  }

  const action = await readPendingAction(env, message);

  if (!action) {
    await replyToBotMessage(env, message, "Нет подготовленного удаления.");
    return jsonResponse({ ok: true, command: "canceldelete", empty: true });
  }

  await clearPendingAction(env, message);
  await replyToBotMessage(env, message, "Удаление отменено.");

  return jsonResponse({ ok: true, command: "canceldelete", cancelled: true });
}

async function savePendingAction(env, message, action) {
  const key = getPendingActionKey(message);
  const now = Date.now();
  const pendingAction = {
    ...action,
    actionId: createPendingActionId(),
    createdAt: now,
    expiresAt: now + DELETE_CONFIRM_TTL_SECONDS * 1000,
  };

  if (!key) {
    return null;
  }

  await env.POSTS_KV.put(
    key,
    JSON.stringify(pendingAction),
    { expirationTtl: DELETE_CONFIRM_TTL_SECONDS },
  );

  return pendingAction;
}

async function readPendingAction(env, message) {
  const key = getPendingActionKey(message);

  if (!key) {
    return null;
  }

  const action = await env.POSTS_KV.get(key, { type: "json" });

  if (!action) {
    return null;
  }

  if (Number(action.expiresAt || 0) < Date.now()) {
    await env.POSTS_KV.delete(key);
    return null;
  }

  return action;
}

async function clearPendingAction(env, message) {
  const key = getPendingActionKey(message);

  if (key) {
    await env.POSTS_KV.delete(key);
  }
}

function getPendingActionKey(message) {
  const userId = message.from?.id || message.chat?.id;

  return userId ? `${PENDING_ACTION_KEY_PREFIX}${userId}` : "";
}

function createPendingActionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildDeleteKeyboard(actionId) {
  return {
    inline_keyboard: [
      [
        { text: "Да, удалить", callback_data: `delete_confirm:${actionId}` },
        { text: "Отмена", callback_data: `delete_cancel:${actionId}` },
      ],
    ],
  };
}

function messageFromCallbackQuery(query) {
  return {
    chat: query.message?.chat || {},
    message_id: query.message?.message_id,
    from: query.from,
  };
}

async function handlePodcastCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам подкастов.");
    return jsonResponse({ ok: true, command: "podcast", denied: true });
  }

  const embed = parseVideoEmbed(message.caption || message.text || "");

  if (!pickPodcastVideo(message) && !embed) {
    await replyToBotMessage(
      env,
      message,
      "Пришлите видео или ссылку на YouTube/VK с подписью: /podcast Название выпуска",
    );
    return jsonResponse({ ok: true, command: "podcast", error: "missing_video" });
  }

  const { podcast } = await storePodcast(message, env, text);
  const statusLine = podcast.embedUrl
    ? `Видео встроено с ${podcast.videoPlatform === "youtube" ? "YouTube" : "VK"}.`
    : podcast.videoStatus === "saved"
      ? "Видео сохранено для страницы выпусков."
      : `Видео не сохранено: ${podcast.videoError || "неизвестная ошибка"}`;

  await replyToBotMessage(
    env,
    message,
    [`Подкаст добавлен: ${podcast.title}`, statusLine].join("\n"),
  );

  return jsonResponse({
    ok: true,
    command: "podcast",
    storedPodcast: podcast.id,
    videoStatus: podcast.videoStatus,
  });
}

async function handleDeletePodcastCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам подкастов.");
    return jsonResponse({ ok: true, command: "deletepodcast", denied: true });
  }

  const podcasts = await readPodcasts(env);
  const deleteTarget = parseDeleteTarget(text, "deletepodcast");
  let messageId = deleteTarget.messageId;

  if (!deleteTarget.raw && podcasts.length) {
    messageId = podcasts[0].messageId;
  }

  if (!deleteTarget.raw && !podcasts.length) {
    await replyToBotMessage(env, message, "На странице подкастов пока нет выпусков.");
    return jsonResponse({ ok: true, command: "deletepodcast", empty: true });
  }

  if (deleteTarget.raw && !messageId) {
    await replyToBotMessage(env, message, "Формат: /deletepodcast или /deletepodcast 123");
    return jsonResponse({ ok: true, command: "deletepodcast", error: "missing_message_id" });
  }

  const action = await savePendingAction(env, message, {
    type: "delete_podcast",
    messageId,
  });

  if (!action) {
    await replyToBotMessage(env, message, "Не смог сохранить подтверждение. Попробуйте ещё раз.");
    return jsonResponse({ ok: true, command: "deletepodcast", error: "pending_action_failed" });
  }

  await replyToBotMessage(
    env,
    message,
    [
      `Подкаст ${messageId} подготовлен к удалению со страницы.`,
      "Подтвердите действие кнопкой ниже.",
      "Команда действует 10 минут.",
    ].join("\n"),
    { reply_markup: buildDeleteKeyboard(action.actionId) },
  );

  return jsonResponse({ ok: true, command: "deletepodcast", pending: true, messageId });
}

async function executeDeletePodcast(message, env, messageId) {
  const podcasts = await readPodcasts(env);
  const nextPodcasts = removePodcast(podcasts, messageId);
  const deletedPodcasts = podcasts.filter(
    (podcast) => !nextPodcasts.some((nextPodcast) => nextPodcast.id === podcast.id),
  );

  await env.POSTS_KV.put(PODCASTS_KEY, JSON.stringify(nextPodcasts));
  await deletePodcastVideos(env, deletedPodcasts);
  await replyToBotMessage(
    env,
    message,
    podcasts.length !== nextPodcasts.length
      ? `Подкаст ${messageId} удалён со страницы.`
      : `Подкаст ${messageId} не найден на странице.`,
  );

  return jsonResponse({
    ok: true,
    command: "confirmdelete",
    action: "deletepodcast",
    messageId,
    siteDeleted: podcasts.length !== nextPodcasts.length,
  });
}

async function handleStatusCommand(message, env) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам ленты.");
    return jsonResponse({ ok: true, command: "status", denied: true });
  }

  const posts = await readPosts(env);
  const podcasts = await readPodcasts(env);
  const latestPost = posts[0];
  const latestPodcast = podcasts[0];
  const latestImageLine = latestPost
    ? `Последний пост: ${latestPost.mediaType || "text"}, фото: ${latestPost.imageStatus || "none"}`
    : "Последний пост: нет";
  const latestPodcastLine = latestPodcast
    ? `Последний подкаст: ${latestPodcast.title}, видео: ${latestPodcast.videoStatus || "none"}`
    : "Последний подкаст: нет";

  await replyToBotMessage(
    env,
    message,
    [
      `KV: ${env.POSTS_KV ? "ok" : "нет"}`,
      `TELEGRAM_BOT_TOKEN: ${env.TELEGRAM_BOT_TOKEN ? "ok" : "нет"}`,
      `Канал: ${getChannelChatId(env) || "не настроен"}`,
      `Постов в ленте: ${posts.length}`,
      `Подкастов: ${podcasts.length}`,
      latestImageLine,
      latestPodcastLine,
    ].join("\n"),
  );

  return jsonResponse({ ok: true, command: "status" });
}

async function handleAddUserCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "adduser", denied: true });
  }

  const userId = parseUserId(text);

  if (!userId) {
    await replyToBotMessage(
      env,
      message,
      "Формат: /adduser 123456789 — числовой Telegram ID. Узнать свой ID можно командой /whoami.",
    );
    return jsonResponse({ ok: true, command: "adduser", error: "missing_id" });
  }

  if (getEnvAdminIds(env).includes(userId)) {
    await replyToBotMessage(env, message, `Пользователь ${userId} уже администратор (задан в настройках).`);
    return jsonResponse({ ok: true, command: "adduser", already: true });
  }

  const ids = await getDynamicAdminIds(env);

  if (ids.includes(userId)) {
    await replyToBotMessage(env, message, `Пользователь ${userId} уже в списке администраторов.`);
    return jsonResponse({ ok: true, command: "adduser", already: true });
  }

  ids.push(userId);
  await env.POSTS_KV.put(ADMINS_KEY, JSON.stringify(ids));
  await replyToBotMessage(env, message, `Пользователь ${userId} добавлен в администраторы.`);

  return jsonResponse({ ok: true, command: "adduser", added: userId });
}

async function handleRemoveUserCommand(message, env, text) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "removeuser", denied: true });
  }

  const userId = parseUserId(text);

  if (!userId) {
    await replyToBotMessage(env, message, "Формат: /removeuser 123456789 — числовой Telegram ID.");
    return jsonResponse({ ok: true, command: "removeuser", error: "missing_id" });
  }

  if (getEnvAdminIds(env).includes(userId)) {
    await replyToBotMessage(
      env,
      message,
      `Пользователь ${userId} задан в настройках окружения — убрать его можно только там.`,
    );
    return jsonResponse({ ok: true, command: "removeuser", protected: true });
  }

  const ids = await getDynamicAdminIds(env);

  if (!ids.includes(userId)) {
    await replyToBotMessage(env, message, `Пользователь ${userId} не найден в списке администраторов.`);
    return jsonResponse({ ok: true, command: "removeuser", missing: true });
  }

  const nextIds = ids.filter((id) => id !== userId);
  await env.POSTS_KV.put(ADMINS_KEY, JSON.stringify(nextIds));
  await replyToBotMessage(env, message, `Пользователь ${userId} удалён из администраторов.`);

  return jsonResponse({ ok: true, command: "removeuser", removed: userId });
}

async function handleListUsersCommand(message, env) {
  if (!(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "users", denied: true });
  }

  const envIds = getEnvAdminIds(env);
  const dynamicIds = await getDynamicAdminIds(env);

  await replyToBotMessage(
    env,
    message,
    [
      "Администраторы ленты:",
      `Из настроек: ${envIds.length ? envIds.join(", ") : "нет"}`,
      `Добавленные: ${dynamicIds.length ? dynamicIds.join(", ") : "нет"}`,
    ].join("\n"),
  );

  return jsonResponse({ ok: true, command: "users" });
}

function parseUserId(text) {
  const match = String(text).match(/(?:^|\s)(\d{4,})\b/);

  return match ? match[1] : "";
}

function isValidTelegramSecret(request, env) {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    return false;
  }

  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === expectedSecret;
}

function isAllowedChannel(chat, env) {
  if (!chat) {
    return false;
  }

  if (env.TELEGRAM_CHANNEL_ID && String(chat.id) !== String(env.TELEGRAM_CHANNEL_ID)) {
    return false;
  }

  if (env.TELEGRAM_CHANNEL_USERNAME) {
    const expectedUsername = normalizeUsername(env.TELEGRAM_CHANNEL_USERNAME);
    const actualUsername = normalizeUsername(chat.username || "");

    if (actualUsername !== expectedUsername) {
      return false;
    }
  }

  return true;
}

function isCommand(text, command) {
  return new RegExp(`^/${command}(?:@\\w+)?(?:\\s|$)`, "i").test(text);
}

function getEnvAdminIds(env) {
  return String(env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function getDynamicAdminIds(env) {
  const ids = await env.POSTS_KV.get(ADMINS_KEY, { type: "json" });

  return Array.isArray(ids) ? ids.map((id) => String(id)) : [];
}

async function isAdminMessage(message, env) {
  const userId = String(message.from?.id || "");

  if (!userId) {
    return false;
  }

  if (getEnvAdminIds(env).includes(userId)) {
    return true;
  }

  const dynamicIds = await getDynamicAdminIds(env);

  return dynamicIds.includes(userId);
}

function parseDeleteTarget(text, command = "delete") {
  const commandPattern = new RegExp(`^/${command}(?:@\\w+)?`, "i");
  const target = text.replace(commandPattern, "").trim();

  if (!target) {
    return {
      raw: "",
      messageId: null,
    };
  }

  if (/^\d+$/.test(target)) {
    return {
      raw: target,
      messageId: Number(target),
    };
  }

  const match = target.match(/\/(\d+)(?:\?.*)?$/);

  return {
    raw: target,
    messageId: match ? Number(match[1]) : null,
  };
}

function getChannelChatId(env) {
  if (env.TELEGRAM_CHANNEL_ID) {
    return env.TELEGRAM_CHANNEL_ID;
  }

  if (env.TELEGRAM_CHANNEL_USERNAME) {
    return `@${normalizeUsername(env.TELEGRAM_CHANNEL_USERNAME)}`;
  }

  return "";
}

async function normalizePost(message, env) {
  const chat = message.chat || {};
  const text = message.text || message.caption || "";
  const username = chat.username || "";
  const postId = `${chat.id}:${message.message_id}`;
  const photo = pickPhoto(message.photo);
  const image = photo ? await saveTelegramPhoto(env, postId, photo) : null;
  const imageStatus = photo ? image?.status || "error" : "none";

  return {
    id: postId,
    messageId: message.message_id,
    chatId: chat.id,
    chatTitle: chat.title || "",
    chatUsername: username,
    date: message.date || Math.floor(Date.now() / 1000),
    editedDate: message.edit_date || null,
    text: text.trim().slice(0, 1400),
    link: username ? `https://t.me/${username}/${message.message_id}` : "",
    mediaGroupId: message.media_group_id || "",
    mediaType: detectMediaType(message),
    imageUrl: image?.url || "",
    imageKey: image?.key || "",
    imageStatus,
    imageError: image?.error || "",
    imageWidth: photo?.width || null,
    imageHeight: photo?.height || null,
    receivedAt: new Date().toISOString(),
  };
}

async function storePodcast(message, env, rawText = "") {
  const podcasts = await readPodcasts(env);
  const previousPodcast = findPodcast(podcasts, message);
  const podcast = await normalizePodcast(message, env, rawText);
  const nextPodcasts = upsertPodcast(podcasts, podcast);
  const stalePodcasts = collectStaleVideoPodcasts(
    podcasts,
    nextPodcasts,
    previousPodcast,
    podcast,
  );

  await env.POSTS_KV.put(PODCASTS_KEY, JSON.stringify(nextPodcasts));
  await deletePodcastVideos(env, stalePodcasts);

  return {
    podcast,
    nextPodcasts,
  };
}

async function normalizePodcast(message, env, rawText = "") {
  const chat = message.chat || {};
  const postId = `${chat.id}:${message.message_id}`;
  const details = parsePodcastDetails(rawText || message.caption || message.text || "");
  const video = pickPodcastVideo(message);
  const savedVideo = video ? await saveTelegramPodcastVideo(env, postId, video) : null;
  const videoStatus = video ? savedVideo?.status || "error" : "none";
  // Use the video's own thumbnail as a default cover; /cover overrides it.
  const thumb = video && (video.thumbnail || video.thumb);
  const savedCover = thumb?.file_id ? await saveTelegramPhoto(env, `podcast-cover:${postId}`, thumb) : null;
  const embed = parseVideoEmbed(rawText || message.caption || message.text || "");
  const coverUrl =
    savedCover?.url ||
    (embed?.platform === "youtube" && embed.videoId
      ? `https://i.ytimg.com/vi/${embed.videoId}/hqdefault.jpg`
      : "");

  return {
    id: postId,
    messageId: message.message_id,
    chatId: chat.id,
    chatTitle: chat.title || "",
    chatUsername: chat.username || "",
    authorId: message.from?.id || null,
    authorName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" "),
    date: message.date || Math.floor(Date.now() / 1000),
    editedDate: message.edit_date || null,
    title: details.title,
    description: details.description,
    text: details.description,
    tags: details.tags || [],
    link: chat.username ? `https://t.me/${chat.username}/${message.message_id}` : "",
    mediaType: "video",
    videoUrl: savedVideo?.url || "",
    videoKey: savedVideo?.key || "",
    videoStatus,
    videoError: savedVideo?.error || "",
    coverUrl,
    coverKey: savedCover?.key || "",
    embedUrl: embed?.embedUrl || "",
    videoPlatform: embed?.platform || (video ? "telegram" : ""),
    videoSize: video?.file_size || null,
    videoDuration: video?.duration || null,
    videoWidth: video?.width || null,
    videoHeight: video?.height || null,
    receivedAt: new Date().toISOString(),
  };
}

function parsePodcastDetails(text) {
  const body = String(text || "")
    .replace(/^\/podcast(?:@\w+)?/i, "")
    .replace(/(^|\s)#podcast\b/gi, " ")
    .trim();
  const tags = extractTags(body);
  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const clean = (value) => value.replace(/https?:\/\/\S+/gi, "").replace(/#[^\s#]+/g, "").trim();
  const title = clean(lines.shift() || "") || "Недельный выпуск";
  const description = clean(lines.join("\n"));

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 1200),
    tags,
  };
}

// Pull hashtags (rubric tags) out of an episode caption, excluding #podcast.
function extractTags(text) {
  const matches = String(text || "").match(/#[^\s#]+/g) || [];
  const seen = new Set();
  const tags = [];

  matches.forEach((raw) => {
    const tag = raw.trim();

    if (/^#podcast$/i.test(tag)) {
      return;
    }

    const key = tag.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  });

  return tags;
}

async function handleSetCover(message, env) {
  const isDirect = Boolean(message.from?.id);

  if (isDirect && !(await isAdminMessage(message, env))) {
    await replyToBotMessage(env, message, "Команда доступна только администраторам.");
    return jsonResponse({ ok: true, command: "cover", denied: true });
  }

  const reply = message.reply_to_message;
  const photo = pickPhoto(message.photo);

  if (!reply || !photo) {
    if (isDirect) {
      await replyToBotMessage(
        env,
        message,
        "Ответьте командой /cover на сообщение с выпуском и приложите фото-обложку.",
      );
    }

    return jsonResponse({ ok: true, command: "cover", error: "missing_reply_or_photo" });
  }

  const stored = await env.POSTS_KV.get(PODCASTS_KEY, { type: "json" });
  const podcasts = Array.isArray(stored) ? stored : [];
  const podcast = podcasts.find((item) => Number(item.messageId) === Number(reply.message_id));

  if (!podcast) {
    if (isDirect) {
      await replyToBotMessage(
        env,
        message,
        "Не нашёл выпуск для этого сообщения. Сначала добавьте видео через /podcast.",
      );
    }

    return jsonResponse({ ok: true, command: "cover", error: "podcast_not_found" });
  }

  const saved = await saveTelegramPhoto(env, `podcast-cover:${podcast.id}`, photo);

  if (saved.status !== "saved") {
    if (isDirect) {
      await replyToBotMessage(env, message, `Не удалось сохранить обложку: ${saved.error || "ошибка"}.`);
    }

    return jsonResponse({ ok: true, command: "cover", error: "save_failed" });
  }

  podcast.coverUrl = saved.url;
  podcast.coverKey = saved.key;
  await env.POSTS_KV.put(PODCASTS_KEY, JSON.stringify(podcasts));

  if (isDirect) {
    await replyToBotMessage(env, message, `Обложка добавлена к выпуску «${podcast.title || "выпуск"}».`);
  }

  return jsonResponse({ ok: true, command: "cover", podcast: podcast.id });
}

function isCoverPost(message) {
  const text = message.text || message.caption || "";

  return Boolean(message.reply_to_message && pickPhoto(message.photo) && isCommand(text, "cover"));
}

function isPodcastPost(message) {
  const text = message.text || message.caption || "";

  return Boolean(
    (pickPodcastVideo(message) || parseVideoEmbed(text)) &&
      (isCommand(text, "podcast") || /(^|\s)#podcast\b/i.test(text)),
  );
}

// Recognise a YouTube / VK video link and build an embeddable URL.
function parseVideoEmbed(text) {
  const str = String(text || "");

  const yt = str.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );

  if (yt) {
    return { platform: "youtube", videoId: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  }

  const vk = str.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);

  if (vk) {
    return {
      platform: "vk",
      videoId: `${vk[1]}_${vk[2]}`,
      embedUrl: `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2`,
    };
  }

  const vkExt = str.match(/https?:\/\/vk\.com\/video_ext\.php\?\S+/i);

  if (vkExt) {
    return { platform: "vk", videoId: "", embedUrl: vkExt[0].replace(/[).,]+$/, "") };
  }

  return null;
}

function detectMediaType(message) {
  if (message.photo) {
    return "photo";
  }

  if (message.video) {
    return "video";
  }

  if (message.animation) {
    return "animation";
  }

  if (message.document) {
    return "document";
  }

  return "text";
}

function upsertPost(posts, post) {
  if (post.mediaGroupId) {
    return upsertAlbumPost(posts, post);
  }

  const withoutCurrent = posts.filter((item) => item.id !== post.id);

  return [post, ...withoutCurrent]
    .sort((left, right) => (right.date || 0) - (left.date || 0))
    .slice(0, MAX_POSTS);
}

function upsertAlbumPost(posts, post) {
  const existingAlbum = posts.find(
    (item) => item.mediaGroupId &&
      item.mediaGroupId === post.mediaGroupId &&
      String(item.chatId) === String(post.chatId),
  );
  const withoutAlbum = posts.filter((item) => {
    if (item.id === post.id) {
      return false;
    }

    return !(
      item.mediaGroupId &&
      item.mediaGroupId === post.mediaGroupId &&
      String(item.chatId) === String(post.chatId)
    );
  });
  const mergedPost = mergePostGroup(existingAlbum ? [existingAlbum, post] : [post], post);

  return [mergedPost, ...withoutAlbum]
    .sort((left, right) => (right.date || 0) - (left.date || 0))
    .slice(0, MAX_POSTS);
}

function upsertPodcast(podcasts, podcast) {
  const withoutCurrent = podcasts.filter((item) => item.id !== podcast.id);

  return [podcast, ...withoutCurrent]
    .sort((left, right) => (right.date || 0) - (left.date || 0))
    .slice(0, MAX_PODCASTS);
}

function findPost(posts, message) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;

  return posts.find((post) => {
    if (String(post.id) === `${chatId}:${messageId}`) {
      return true;
    }

    return Array.isArray(post.messageIds) &&
      post.messageIds.some((id) => Number(id) === Number(messageId));
  }) || null;
}

function findPodcast(podcasts, message) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;

  return podcasts.find((podcast) => String(podcast.id) === `${chatId}:${messageId}`) || null;
}

function collectStaleImageKeys(posts, nextPosts) {
  const nextImageKeys = new Set(nextPosts.flatMap(collectPostImageKeys));

  return [...new Set(posts.flatMap(collectPostImageKeys))]
    .filter((imageKey) => !nextImageKeys.has(imageKey));
}

function collectStaleVideoPodcasts(podcasts, nextPodcasts, previousPodcast, nextPodcast) {
  const nextIds = new Set(nextPodcasts.map((podcast) => podcast.id));
  const removedPodcasts = podcasts.filter((podcast) => !nextIds.has(podcast.id));

  if (previousPodcast?.videoKey && previousPodcast.videoKey !== nextPodcast.videoKey) {
    removedPodcasts.push(previousPodcast);
  }

  return removedPodcasts;
}

function pickPhoto(photos = []) {
  if (!Array.isArray(photos) || !photos.length) {
    return null;
  }

  const sorted = [...photos].sort((left, right) => {
    const leftPixels = Number(left.width || 0) * Number(left.height || 0);
    const rightPixels = Number(right.width || 0) * Number(right.height || 0);

    return rightPixels - leftPixels;
  });

  return sorted.find((photo) => Number(photo.file_size || 0) <= MAX_IMAGE_BYTES) || sorted.at(-1);
}

function pickPodcastVideo(message) {
  if (message.video?.file_id) {
    return {
      ...message.video,
      source: "video",
      mime_type: message.video.mime_type || "video/mp4",
    };
  }

  const document = message.document;

  if (document?.file_id && String(document.mime_type || "").startsWith("video/")) {
    return {
      file_id: document.file_id,
      file_size: document.file_size || null,
      file_name: document.file_name || "",
      mime_type: document.mime_type || "video/mp4",
      source: "document",
    };
  }

  return null;
}

async function saveTelegramPhoto(env, postId, photo) {
  if (!photo?.file_id || !env.TELEGRAM_BOT_TOKEN) {
    return {
      status: "error",
      error: "TELEGRAM_BOT_TOKEN не настроен",
    };
  }

  const file = await callTelegram(env, "getFile", {
    file_id: photo.file_id,
  });

  if (!file.ok || !file.result?.file_path) {
    return {
      status: "error",
      error: file.description || "Telegram не вернул путь к файлу",
    };
  }

  const fileResponse = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`,
  );

  if (!fileResponse.ok) {
    return {
      status: "error",
      error: `Telegram file API error ${fileResponse.status}`,
    };
  }

  const imageBytes = await fileResponse.arrayBuffer();

  if (!imageBytes.byteLength) {
    return {
      status: "error",
      error: "Telegram вернул пустой файл",
    };
  }

  if (imageBytes.byteLength > MAX_IMAGE_BYTES) {
    return {
      status: "error",
      error: "Файл больше лимита 4 МБ",
    };
  }

  const imageKey = `${IMAGE_KEY_PREFIX}${postId}`;
  const contentType =
    fileResponse.headers.get("Content-Type") || inferImageContentType(file.result.file_path);

  await env.POSTS_KV.put(imageKey, imageBytes, {
    metadata: {
      contentType,
      filePath: file.result.file_path,
      width: photo.width || null,
      height: photo.height || null,
    },
  });

  return {
    status: "saved",
    key: imageKey,
    url: `/api/post-image?key=${encodeURIComponent(imageKey)}`,
  };
}

async function saveTelegramPodcastVideo(env, podcastId, video) {
  if (!video?.file_id || !env.TELEGRAM_BOT_TOKEN) {
    return {
      status: "error",
      error: "TELEGRAM_BOT_TOKEN не настроен",
    };
  }

  if (Number(video.file_size || 0) > MAX_PODCAST_VIDEO_BYTES) {
    return {
      status: "error",
      error: "Видео больше лимита 20 МБ",
    };
  }

  const file = await callTelegram(env, "getFile", {
    file_id: video.file_id,
  });

  if (!file.ok || !file.result?.file_path) {
    return {
      status: "error",
      error: file.description || "Telegram не вернул путь к файлу",
    };
  }

  const fileResponse = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.result.file_path}`,
  );

  if (!fileResponse.ok) {
    return {
      status: "error",
      error: `Telegram file API error ${fileResponse.status}`,
    };
  }

  const videoBytes = await fileResponse.arrayBuffer();

  if (!videoBytes.byteLength) {
    return {
      status: "error",
      error: "Telegram вернул пустой файл",
    };
  }

  if (videoBytes.byteLength > MAX_PODCAST_VIDEO_BYTES) {
    return {
      status: "error",
      error: "Видео больше лимита 20 МБ",
    };
  }

  const videoKey = `${PODCAST_VIDEO_KEY_PREFIX}${podcastId}`;
  const contentType =
    video.mime_type ||
    fileResponse.headers.get("Content-Type") ||
    inferVideoContentType(file.result.file_path);

  await env.POSTS_KV.put(videoKey, videoBytes, {
    metadata: {
      contentType,
      filePath: file.result.file_path,
      fileName: video.file_name || "",
      duration: video.duration || null,
      width: video.width || null,
      height: video.height || null,
    },
  });

  return {
    status: "saved",
    key: videoKey,
    url: `/api/podcast-video?key=${encodeURIComponent(videoKey)}`,
  };
}

function inferImageContentType(filePath = "") {
  const path = String(filePath).toLowerCase();

  if (path.endsWith(".png")) {
    return "image/png";
  }

  if (path.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function inferVideoContentType(filePath = "") {
  const path = String(filePath).toLowerCase();

  if (path.endsWith(".webm")) {
    return "video/webm";
  }

  if (path.endsWith(".mov")) {
    return "video/quicktime";
  }

  return "video/mp4";
}

async function deletePostImages(env, posts) {
  const imageKeys = [
    ...new Set(
      posts.flatMap((item) => typeof item === "string" ? item : collectPostImageKeys(item)),
    ),
  ];

  await Promise.all(imageKeys.map((imageKey) => env.POSTS_KV.delete(imageKey).catch(() => {})));
}

async function deletePodcastVideos(env, podcasts) {
  const videoKeys = [
    ...new Set(podcasts.flatMap((podcast) => [podcast.videoKey, podcast.coverKey]).filter(Boolean)),
  ];

  await Promise.all(videoKeys.map((videoKey) => env.POSTS_KV.delete(videoKey).catch(() => {})));
}

function filterVisiblePosts(posts, env) {
  const resetAt = getFeedResetAt(env);

  return posts.filter((post) => Number(post.date || 0) >= resetAt);
}

function collapsePostAlbums(posts) {
  const albumGroups = new Map();
  const legacyGroups = new Map();
  const singles = [];

  posts.forEach((post) => {
    if (post.mediaGroupId) {
      appendToGroup(albumGroups, `${post.chatId}:album:${post.mediaGroupId}`, post);
      return;
    }

    if (isPhotoPost(post) && Number(post.date || 0)) {
      appendToGroup(legacyGroups, `${post.chatId}:legacy:${post.date}`, post);
      return;
    }

    singles.push(post);
  });

  const mergedAlbums = [...albumGroups.values()].map((group) => mergePostGroup(group));
  const mergedLegacyPosts = [...legacyGroups.values()].flatMap((group) => {
    if (group.length > 1 && group.some(isEmptyPost)) {
      return [mergePostGroup(group)];
    }

    return group;
  });

  return [...singles, ...mergedAlbums, ...mergedLegacyPosts]
    .sort(comparePosts)
    .slice(0, MAX_POSTS);
}

function appendToGroup(groups, key, post) {
  const group = groups.get(key) || [];

  group.push(post);
  groups.set(key, group);
}

function mergePostGroup(group, preferredPost = null) {
  const sortedGroup = [...group].sort(comparePostsByMessageId);
  const textSource =
    (hasPostText(preferredPost) ? preferredPost : null) ||
    sortedGroup.find(hasPostText) ||
    sortedGroup[0];
  const images = uniqueImages(sortedGroup.flatMap(collectPostImages)).sort(compareImages);
  const firstImage = images[0] || null;
  const messageIds = [
    ...new Set(sortedGroup.flatMap((post) => post.messageIds || [post.messageId]).filter(Boolean)),
  ].sort((left, right) => Number(left) - Number(right));

  return {
    ...textSource,
    id: textSource.mediaGroupId
      ? `${textSource.chatId}:album:${textSource.mediaGroupId}`
      : textSource.id,
    messageId: textSource.messageId || messageIds[0] || null,
    messageIds,
    date: Math.max(...sortedGroup.map((post) => Number(post.date || 0))),
    editedDate: Math.max(...sortedGroup.map((post) => Number(post.editedDate || 0))) || null,
    text: String(textSource.text || "").trim(),
    link: textSource.link || sortedGroup.find((post) => post.link)?.link || "",
    mediaType: images.length ? "photo" : textSource.mediaType,
    images,
    imageUrl: textSource.imageUrl || firstImage?.url || "",
    imageKey: textSource.imageKey || firstImage?.key || "",
    imageStatus: firstImage ? "saved" : textSource.imageStatus || "none",
    imageError: textSource.imageError || "",
    imageWidth: textSource.imageWidth || firstImage?.width || null,
    imageHeight: textSource.imageHeight || firstImage?.height || null,
  };
}

function collectPostImages(post) {
  const images = Array.isArray(post.images) ? post.images : [];
  const normalizedImages = images
    .map((image) => normalizePostImage(image, post))
    .filter((image) => image.url || image.key);

  if (post.imageUrl || post.imageKey) {
    normalizedImages.push(normalizePostImage({
      url: post.imageUrl,
      key: post.imageKey,
      width: post.imageWidth,
      height: post.imageHeight,
      messageId: post.messageId,
    }, post));
  }

  return normalizedImages;
}

function normalizePostImage(image, post) {
  return {
    url: image.url || "",
    key: image.key || "",
    width: image.width || null,
    height: image.height || null,
    messageId: image.messageId || post.messageId || null,
  };
}

function uniqueImages(images) {
  const seen = new Set();

  return images.filter((image) => {
    const key = image.key || image.url;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function collectPostImageKeys(post) {
  return collectPostImages(post).map((image) => image.key).filter(Boolean);
}

function comparePosts(left, right) {
  const dateDelta = Number(right.date || 0) - Number(left.date || 0);

  if (dateDelta) {
    return dateDelta;
  }

  return Number(right.messageId || 0) - Number(left.messageId || 0);
}

function comparePostsByMessageId(left, right) {
  return Number(left.messageId || 0) - Number(right.messageId || 0);
}

function compareImages(left, right) {
  return Number(left.messageId || 0) - Number(right.messageId || 0);
}

function hasPostText(post) {
  return Boolean(String(post?.text || post?.caption || "").trim());
}

function isEmptyPost(post) {
  return !hasPostText(post);
}

function isPhotoPost(post) {
  return post?.mediaType === "photo" || Boolean(post?.imageUrl || post?.imageKey);
}

function filterVisiblePodcasts(podcasts, env) {
  const resetAt = Number(env.TELEGRAM_PODCAST_RESET_AT || 0) || 0;

  return podcasts.filter((podcast) => Number(podcast.date || 0) >= resetAt);
}

function getFeedResetAt(env) {
  return Number(env.TELEGRAM_FEED_RESET_AT || DEFAULT_FEED_RESET_AT) || 0;
}

function removePost(posts, messageId) {
  return posts.filter((post) => {
    if (Number(post.messageId) === Number(messageId)) {
      return false;
    }

    if (Array.isArray(post.messageIds) && post.messageIds.some((id) => Number(id) === Number(messageId))) {
      return false;
    }

    return !String(post.link || "").match(new RegExp(`/${messageId}(?:\\?.*)?$`));
  });
}

function removePodcast(podcasts, messageId) {
  return podcasts.filter((podcast) => Number(podcast.messageId) !== Number(messageId));
}

function normalizeUsername(username) {
  return String(username).replace(/^@/, "").trim().toLowerCase();
}

async function replyToBotMessage(env, message, text, extraPayload = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !message.chat?.id) {
    return;
  }

  await callTelegram(env, "sendMessage", {
    chat_id: message.chat.id,
    text,
    reply_to_message_id: message.message_id,
    ...extraPayload,
  });
}

async function answerCallbackQuery(env, query, text, showAlert = false) {
  if (!query.id) {
    return;
  }

  await callTelegram(env, "answerCallbackQuery", {
    callback_query_id: query.id,
    text,
    show_alert: showAlert,
  });
}

async function removeCallbackButtons(env, query) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  await callTelegram(env, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

async function editCallbackMessage(env, query, text) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  await callTelegram(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
  });
}

async function callTelegram(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, description: "TELEGRAM_BOT_TOKEN не настроен" };
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    return {
      ok: false,
      description: data.description || `Telegram API error ${response.status}`,
    };
  }

  return data;
}

function buildDeleteReply(messageId, telegramResult, oldPosts, nextPosts) {
  const telegramLine = telegramResult.ok
    ? "в Telegram удалён"
    : `Telegram не удалил: ${telegramResult.description}`;
  const siteLine = oldPosts.length !== nextPosts.length ? "из ленты сайта удалён" : "в ленте сайта уже не найден";

  return `Пост ${messageId}: ${telegramLine}; ${siteLine}.`;
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...init.headers,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
  };
}
