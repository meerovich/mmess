# Secrets

Реальные секреты не должны жить в git. Для `mmess` безопасная схема такая:

## Где хранить реальные значения

- Локально: `.env.secrets`
- На VPS: `/opt/mmess/.env.production`

Оба файла игнорируются git и не должны коммититься.

## Что хранить

Обязательные секреты для production:

- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Опционально, если используется соответствующий функционал:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `CODEX_BOT_PASSWORD`
- `OPENAI_API_KEY`

Шаблон ключей лежит в [E:/dev/mmess/.env.secrets.example](E:/dev/mmess/.env.secrets.example).

## Как не потерять секреты

1. Держать основной рабочий файл на VPS в `/opt/mmess/.env.production`.
2. Держать локальную копию в `.env.secrets`, но только вне git.
3. Хранить отдельную оффлайн-резервную копию вне репозитория.
4. Не записывать реальные значения в `BOT_CONTEXT.md`, `README.md`, коммиты или чат.

## Проверка перед деплоем

Перед любым деплоем запускать:

```bash
npm run check:secrets -- .env.production
```

Или для локальной копии:

```bash
npm run check:secrets -- .env.secrets
```

Скрипт остановит процесс, если обнаружит пустые или placeholder-значения вроде `change-me` и `REPLACE_WITH...`.

## Практическое правило

Если секрет изменился:

1. обновить `/opt/mmess/.env.production`
2. обновить локальную `.env.secrets`
3. обновить внешнюю резервную копию вне repo
4. только потом пересоздавать контейнеры
