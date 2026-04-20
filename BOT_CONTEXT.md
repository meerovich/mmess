# BOT_CONTEXT

Этот файл хранит рабочую память для будущих сессий и служебных ботов. Секреты сюда не записываются.

## Project

- `mmess` — self-hosted web messenger с критичным приоритетом real-time доставки.
- Рабочая копия: `E:/dev/mmess`
- Продовый хост: VPS с каталогом `/opt/mmess`

## Deploy Rules

- Любой деплой обязан поднимать версию в корневом `package.json`.
- `APP_VERSION` на сервере и `VITE_APP_VERSION` у клиента должны совпадать.
- `/api/health` всегда должен отдавать одинаковые `version` и `minClientVersion`.
- Даже для client-only фиксов после выкладки нужно проверить `/api/health`.
- Перед деплоем secrets проверяются через `npm run check:secrets -- <env-file>`.
- Продовая статика клиента раздаётся только из `/opt/mmess/client/dist` через volume `./client/dist:/srv/www` в `caddy`.
- Каталог `/opt/mmess/dist` не является deploy-target для SPA и не должен использоваться для клиентских выкладок.
- При client deploy нельзя удалять старые hashed bundles из `/opt/mmess/client/dist/assets` сразу: старые вкладки/PWA могут ещё грузить предыдущий `index-*.js` и иначе получают белый экран.
- Безопасный путь: выкладывать новый `client/dist` с сохранением предыдущих asset-файлов хотя бы за 1-2 последних версии или отдельно докладывать старые `assets/*` в прод.

## Git Rules

- Основная локальная ветка: `master`
- Push идёт в GitHub-ветку `main`
- Не смешивать unrelated `.planning` изменения с пользовательскими hotfix-задачами.

## Collaboration Notes

- Во время существенной работы отправлять короткие статусы пользователю `Miha` через `Codex Bot`.
- Для этого использовать `node scripts/codex-bot-chat.mjs send \"...\"`.
- Если нужен отдельный hotfix, не смешивать его с незавершённой функциональной веткой работы.

## Current Product State

- Последняя крупная версия в работе/выкладке: `1.7.0` — практическое E2EE для сообщений и файлов.
- UI follow-up `1.7.1`: аватар группы обрезается тем же crop flow, что и профиль; тап по аватару в profile/group modal открывает fullscreen preview, закрытие поддерживает свайп вниз.
- Navigation note: mobile chat back arrow must use real history back when chat was opened from the list (`location.state.mmessBackToList`), not `replace('/')`; replacing creates duplicate `/` entries and makes iOS swipe-back from the list loop into the same list.
- Push navigation note `1.7.3`: notification targets must normalize any `conversationId` to `/chat/:id`; iOS/PWA may open `/` with query params or even drop query, so the service worker also stores the clicked target in Cache API at `/__mmess_notification_target` and `ChatLayout` replays it on mount/focus/ws-state changes.
- Push delivery note: Web Push must not be gated by per-user `isOnline()`. A desktop/stale WS can mark Miha online and suppress the phone notification. Server sends Web Push to every recipient subscription; client JS Notification is only a fallback when no service worker controller exists.
- Push click note `1.7.5`: iOS PWA can resolve `client.navigate('/chat/:id')` but still foreground the app on `/`. Service worker must always duplicate the clicked target via `postMessage` after navigate/focus/openWindow, and `sw.js` should use `skipWaiting` + `clients.claim`; client registration uses `updateViaCache: 'none'` plus `registration.update()`.
- Push navigation guard note `1.7.6`: the mobile stale-back guard in `ChatLayout` must not run when a chat route is notification-driven. Treat URL push params, stored notification target, and `location.state.mmessFromNotification` as explicit bypasses; otherwise iOS notification clicks can be immediately redirected back to `/`.
- Push wake fallback note `1.7.7`: if iOS PWA still opens `/` and no SW target reaches React, `ChatLayout` arms a short recovery window on mobile/standalone wake. While on the list, the freshest recent unread incoming conversation auto-opens and writes a notification target, covering the observed "push click opens list, message appears seconds later" path.
- Push recovery history note `1.7.8`: recovered notification opens must use normal history push (`replace: false`) and include `location.state.mmessBackToList`, otherwise iOS opens the chat but native swipe-back cannot return to the list; the header back button may still work because it explicitly navigates to `/`.
- Push recovery scope note `1.7.9`: never auto-open a chat just because there is a fresh unread on mobile wake; that also fires on normal app launch from the home screen. Recovery may poll only for an explicit notification target from URL/session/SW cache, and when routing from `/` it should push history with `mmessBackToList`.
- Push server fallback note `1.7.10`: service worker `notificationclick` must also persist the clicked target to `/api/push/open-target`. Client startup/focus recovery should read target from session, SW cache, and this authenticated server endpoint, so iOS can still open the right chat when the message list arrives later or the page starts before the SW controls fetches.
- Codex Bot API note `1.7.11`: for conversations that include `Codex Bot`/`Claude Bot`, the client adds `bot_payload_b64` with plaintext `{ text, file }` inside the E2EE envelope. Regular clients still use AES-GCM `ct`, while `/api/bot/inbox`, `scripts/codex-bot-chat.mjs`, and `server/src/bot/worker.ts` can recover readable text without browser-local keys.
- Input jitter hotfix `1.7.12`: `ChatLayout` must ignore `visualViewport.scroll` corrections while the keyboard is open and focus is inside a text-editable field. iOS selection-handle/cursor drag fires viewport scroll events that otherwise re-translate the whole layout and create the old message-input jitter.
- Bot backfill hotfix `1.7.13`: old E2EE messages in conversations with `Codex Bot`/`Claude Bot` can gain `bot_payload_b64` retroactively. When a normal participant client successfully decrypts such a message, it best-effort posts `/api/e2ee/messages/:messageId/bot-payload`; the server accepts it only for the original sender and only in bot conversations, preserving the ciphertext while appending bot-readable plaintext for future API reads.
- E2EE v1: WebCrypto RSA-OAEP identity key на пользователя + AES-GCM ключ на беседу; сервер хранит только публичные ключи и wrapped conversation key shares, тело сообщения хранится как JSON envelope `mmess-e2ee`.
- Ограничение E2EE v1: приватный ключ хранится на клиенте в `localStorage`; это защищает от чтения БД/обычного серверного просмотра, но не от вредоносного JS, отданного с сервера, и не является hardened multi-device key management.
- При чтении зашифрованного сообщения клиент не должен создавать новый ключ беседы, если share недоступен; иначе можно сохранить неправильный ключ и сломать дальнейшую расшифровку.
- `ChatLayout` публикует публичный E2EE-ключ пользователя сразу после входа, чтобы другие участники могли заранее раздать shares.
- Последний выкаченный hotfix до E2EE-задачи: `1.6.51`
- Long-press UI на мобильных уже разделён на отдельный reaction tray и action menu.
- Reaction tray поддерживает дополнительные emoji через горизонтальный scroll внутри панели без видимого scrollbar.
- Поповер по тапу на галочку уже показывает время доставки и прочтения.
- В работе и почти готов стабилизационный hotfix `1.6.30`:
  - bodyless `POST` больше не ломается из-за принудительного `Content-Type: application/json`, что чинит accept/decline invite;
  - history-навигация ужесточается: chat -> list сохраняется, chat -> chat replace, а возврат в список после нативного swipe-back очищает forward-ветку, чтобы список не мог открыть старый чат;
  - push deep-link теперь передаёт `conversation_id` + `message_id` до клиента и через `postMessage`, и через URL-параметры для сценария "новое standalone iOS окно из уведомления";
  - при открытии чата из push клиент держит notification-target и крутит небольшой preload, пока не доедет нужное сообщение, чтобы не разваливались route/open-state и позиционирование unread;
  - MessageList получил дополнительный bottom safe-area padding, чтобы нижнее сообщение не подрезалось белой системной полосой.
- UX-hotfix `1.6.32` уже закрыл замечания по мобильным переходам после `1.6.31`:
  - на мобильном панели больше не переключаются через `display: none`, а живут как slide-stack с сохранением предыдущей поверхности;
  - список сообщений больше не оставляет лишнюю белую полосу над composer: safe-area возвращён внутрь input bar, а не в отступ списка;
  - возврат chat -> list больше не пытается чистить history прямо в момент жеста: anchor в history ставится только после завершения анимации, чтобы не провоцировать белый провал на iOS;
  - переходы list -> chat и chat -> list снова идут срочно, а skeleton остаётся именно как видимый placeholder под сетевую задержку, а не как замена интерактивности.
- В работе hotfix/feature batch `1.6.33`:
  - свайп вправо на собственном сообщении открывает красивый popover со статусами доставки/прочтения;
  - нижний padding у composer выровнен и больше не оставляет лишнюю пустую область;
  - список чатов стабильно сортируется по последнему сообщению, включая живые обновления при новых сообщениях;
  - время в списке чатов показывается как `HH:mm` сегодня, `Вчера` вчера, иначе `dd.MM.yy`;
  - меню по аватарке доступно и в хедере чата, раскрывается вниз;
  - добавлен `ProfileModal` с редактированием статуса и загрузкой аватарки через существующий upload API;
  - если build-time версия клиента пришла как `dev`, sidebar footer берёт реальную версию из `/api/health`, чтобы UI не показывал `vdev`.
- Следующий client-only hotfix `1.6.34`:
  - режимы `light/dark/system` перенесены в `UserMenu`, отдельный footer toggle убран;
  - стартовый `theme-color` и manifest затемнены для dark-mode, чтобы на iOS/standalone не оставалась светлая верхняя полоса;
  - в хедере DM снова показывается аватар собеседника и строка `был в сети ...`;
  - свайп вправо снова только для ответа, а статусы своих сообщений открываются по свайпу влево;
  - `MessageList` больше не пытается ставить unread divider, если `unread_count = 0`, что должно убрать случайные открытия чата посередине;
  - `ProfileModal` получил нижние кнопки для смены/удаления аватара, более аккуратный close button и встроенный crop перед загрузкой.
- Текущий follow-up hotfix `1.6.35`:
  - на VPS остановлен `codex-bot`, чтобы внешний авто-лиснер больше не читал и не отвечал сам;
  - `scripts/codex-bot-chat.mjs inbox/watch` теперь после чтения входящих сообщений шлёт `read:mark` в нужный чат;
  - в receipt popover время доставки для своих сообщений берётся из `delivered_at`, а если его ещё нет, то из первого `last_read_at`, чтобы вручную прочитанные сообщения не выглядели "недоставленными".

## Secret Policy

- Реальные секреты не хранятся в git и не попадают в `BOT_CONTEXT.md`.
- Локальный секретный файл: `.env.secrets`
- Продовый секретный файл: `/opt/mmess/.env.production`
- Резервную копию секретов хранить отдельно вне репозитория.

## Open Work Notes

- При возобновлении новых UI-hotfix сначала проверить локальный `vite` против VDS-бэка; пользователь предпочитает local-first цикл для экономии времени на деплой.
- Не смешивать текущий batch `1.6.33` с unrelated `.planning` или старыми архивными артефактами в корне репозитория.
