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

- Последний выкаченный hotfix: `1.6.27`
- Long-press UI на мобильных уже разделён на отдельный reaction tray и action menu.
- Reaction tray теперь поддерживает дополнительные emoji через горизонтальный scroll внутри панели без видимого scrollbar.
- Последний micro-hotfix: reaction tray и action menu используют одинаковый visual gap от сообщения.

## Secret Policy

- Реальные секреты не хранятся в git и не попадают в `BOT_CONTEXT.md`.
- Локальный секретный файл: `.env.secrets`
- Продовый секретный файл: `/opt/mmess/.env.production`
- Резервную копию секретов хранить отдельно вне репозитория.

## Open Work Notes

- Есть незавершённая работа по деталям delivery/read receipt, она намеренно не включена в последние hotfix-коммиты.
- При возобновлении этой работы сначала сверить текущее состояние `git stash` и не вытаскивать WIP автоматически в unrelated hotfix.
