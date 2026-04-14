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

## Git Rules

- Основная локальная ветка: `master`
- Push идёт в GitHub-ветку `main`
- Не смешивать unrelated `.planning` изменения с пользовательскими hotfix-задачами.

## Collaboration Notes

- Во время существенной работы отправлять короткие статусы пользователю `Miha` через `Codex Bot`.
- Для этого использовать `node scripts/codex-bot-chat.mjs send \"...\"`.
- Если нужен отдельный hotfix, не смешивать его с незавершённой функциональной веткой работы.

## Current Product State

- Последний выкаченный hotfix: `1.6.24`
- Исправлено поведение long-press menu для узких изображений: меню остаётся стандартной ширины и сдвигается влево, чтобы помещаться в viewport.
- Следующий UI hotfix в работе: отделить reaction tray от action menu в long-press режиме и позиционировать его как в Telegram.

## Open Work Notes

- Есть незавершённая работа по деталям delivery/read receipt, она намеренно не включена в последние hotfix-коммиты.
- При возобновлении этой работы сначала сверить текущее состояние `git stash` и не вытаскивать WIP автоматически в unrelated hotfix.
