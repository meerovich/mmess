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

## Git Rules

- Основная локальная ветка: `master`
- Push идёт в GitHub-ветку `main`
- Не смешивать unrelated `.planning` изменения с пользовательскими hotfix-задачами.

## Collaboration Notes

- Во время существенной работы отправлять короткие статусы пользователю `Miha` через `Codex Bot`.
- Для этого использовать `node scripts/codex-bot-chat.mjs send \"...\"`.
- Если нужен отдельный hotfix, не смешивать его с незавершённой функциональной веткой работы.

## Current Product State

- Последний выкаченный hotfix до текущей задачи: `1.6.29`
- Long-press UI на мобильных уже разделён на отдельный reaction tray и action menu.
- Reaction tray поддерживает дополнительные emoji через горизонтальный scroll внутри панели без видимого scrollbar.
- Поповер по тапу на галочку уже показывает время доставки и прочтения.
- В работе и почти готов стабилизационный hotfix `1.6.30`:
  - bodyless `POST` больше не ломается из-за принудительного `Content-Type: application/json`, что чинит accept/decline invite;
  - history-навигация ужесточается: chat -> list сохраняется, chat -> chat replace, а возврат в список после нативного swipe-back очищает forward-ветку, чтобы список не мог открыть старый чат;
  - push deep-link теперь передаёт `conversation_id` + `message_id` до клиента и через `postMessage`, и через URL-параметры для сценария "новое standalone iOS окно из уведомления";
  - при открытии чата из push клиент держит notification-target и крутит небольшой preload, пока не доедет нужное сообщение, чтобы не разваливались route/open-state и позиционирование unread;
  - MessageList получил дополнительный bottom safe-area padding, чтобы нижнее сообщение не подрезалось белой системной полосой.

## Secret Policy

- Реальные секреты не хранятся в git и не попадают в `BOT_CONTEXT.md`.
- Локальный секретный файл: `.env.secrets`
- Продовый секретный файл: `/opt/mmess/.env.production`
- Резервную копию секретов хранить отдельно вне репозитория.

## Open Work Notes

- Есть незавершённая работа по деталям delivery/read receipt, она намеренно не включена в последние hotfix-коммиты.
- При возобновлении этой работы сначала сверить текущее состояние `git stash` и не вытаскивать WIP автоматически в unrelated hotfix.
