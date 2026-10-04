# Одностороннее зеркало в Google Sheets

Edge Function переносит снимки сущностей из `sync_outbox` в Google Sheets. Она
ничего не читает обратно из таблицы и не меняет данные приложения.

## Однократная настройка

1. В Google Cloud создайте проект и включите **Google Sheets API**.
2. Создайте **Service Account**, затем JSON-ключ для него. Скачанный JSON нельзя
   добавлять в Git.
3. Создайте Google-таблицу и откройте сервисному аккаунту доступ **Editor**.
   Его адрес находится в поле `client_email` JSON-ключа.
4. Скопируйте ID таблицы из URL:
   `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.
5. Примените опциональную миграцию:

   ```bash
   supabase db push
   ```

6. В Supabase Dashboard откройте **Edge Functions → Secrets** и добавьте:

   - `GOOGLE_SERVICE_ACCOUNT_JSON` — полное содержимое скачанного JSON;
   - `GOOGLE_SHEETS_SPREADSHEET_ID` — ID таблицы;
   - `GOOGLE_SHEETS_SYNC_TRIGGER_SECRET` — случайная длинная строка (минимум
     32 байта).

   `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` платформа передаёт функции
   автоматически. Альтернатива одному JSON-секрету:
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

7. Разверните функцию. Проверку JWT можно отключить, потому что сама функция
   обязательно проверяет отдельный заголовок `x-sync-secret`:

   ```bash
   supabase functions deploy google-sheets-sync --no-verify-jwt
   ```

8. Настройте POST-вызов раз в 1–5 минут в Supabase Cron или другом планировщике:

   ```text
   URL: https://<PROJECT_REF>.supabase.co/functions/v1/google-sheets-sync
   Header: x-sync-secret: <GOOGLE_SHEETS_SYNC_TRIGGER_SECRET>
   Body: {"batchSize":50}
   ```

   Секрет вызова храните в Supabase Vault/секретах планировщика, а не в
   клиентском приложении.

При первом запуске автоматически создаются листы `Сотрудники`, `Товары`,
`Периоды`, `Продажи`, `Расчёты`, `Настройки` и `Журнал`.

## Постановка изменений в очередь

Миграция намеренно не создаёт триггеры для доменных таблиц: их схема может
меняться независимо. В той же серверной транзакции, где меняется сущность,
нужно вызвать:

```sql
select public.enqueue_google_sheets_sync(
  p_entity_type := 'employee',
  p_entity_id := 'employee-uuid',
  p_operation := 'upsert',
  p_payload := jsonb_build_object(
    'name', 'Иван',
    'salary', 120000,
    'active', true
  ),
  p_source_updated_at := now()
);
```

Допустимые типы: `employee`, `product`, `period`, `sale`, `calculation`,
`setting`, `audit` (единственное или множественное число). Для удаления
передайте `p_operation := 'delete'`: в Sheets останется строка-тумбстоун с
`_operation = delete`.

Вызов `enqueue_google_sheets_sync` доступен только `service_role`. Клиентское
приложение не должно получать этот ключ; вызывайте функцию из доверенного
backend/RPC.

## Как работает повторная обработка

- Для пары `entity_type + entity_id` в очереди хранится только самый новый
  снимок.
- В каждом листе строка ищется по колонке `entity_id`: найденная строка
  обновляется, отсутствующая — добавляется.
- Повтор после сетевой ошибки снова найдёт эту же строку, поэтому штатный
  повтор не создаёт новую строку.
- Неудачная попытка остаётся `pending` с экспоненциальной задержкой. После
  восьми попыток запись получает статус `failed`. Успешная — `sent`.
- Конкурирующие запуски используют lease и `claim_token`; устаревший запуск не
  может отметить новую версию сущности обработанной.

Для ручного возврата окончательно ошибочной записи в очередь:

```sql
update public.sync_outbox
set status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    last_error = null,
    claim_token = null,
    locked_at = null,
    updated_at = now()
where id = <OUTBOX_ID> and status = 'error';
```

## Формат листов и ограничения

Колонки формируются из ключей `payload`; объекты и массивы записываются как
стабильный JSON. Служебные колонки начинаются с `_`. Значения отправляются в
режиме `RAW`, поэтому строки, начинающиеся с `=`, не превращаются в формулы.

Ограничения:

- это eventual consistency, а не общая транзакция PostgreSQL + Google Sheets;
- при двух независимых писателях в один spreadsheet возможна гонка добавления,
  поэтому писать в эти листы должна только данная функция;
- удаление строки в приложении создаёт тумбстоун, но физически строку из Sheets
  не удаляет;
- изменение заголовков и `entity_id` вручную может нарушить сопоставление;
- окончательные ошибки требуют ручного возврата в `pending`;
- функция не создаёт доменные триггеры: каждое нужное изменение необходимо
  явно ставить в outbox.
