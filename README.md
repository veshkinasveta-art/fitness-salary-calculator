# Зарплата студии

Веб-приложение для расчёта зарплаты команды фитнес-студии. Поддерживает любое число сотрудников, светлую и тёмную тему, офлайн-черновики и совместную работу через Supabase.

Публичная страница: https://veshkinasveta-art.github.io/

Android-проект в соседней папке не изменяется и не удаляется.

## Возможности

- оплата смен, личные продажи и KPI;
- ступени командного фонда и распределение поровну / пропорционально / по весам;
- периоды `черновик → рассчитан → закрыт` с неизменяемым снимком;
- роли `owner`, `manager`, `viewer`;
- автоматическая односторонняя копия в Google Таблицу;
- ручной JSON-backup и CSV-отчёт.

Деньги хранятся целыми копейками. Расчёт выполняется в `src/domain`, а не в экранах.

## Локальный запуск

Нужен Node.js 22+.

```bash
npm install
npm run dev
```

Проверки:

```bash
npm test
npm run build
npm run test:e2e
```

## Облако

1. Создайте бесплатный проект Supabase.
2. Примените SQL из `supabase/migrations`.
3. Скопируйте URL и anon-ключ в `.env` по образцу `.env.example`.
4. Добавьте `https://veshkinasveta-art.github.io/` в Auth → Redirect URLs.
5. Настройте Google Таблицу по [docs/GOOGLE_SHEETS_SETUP.md](docs/GOOGLE_SHEETS_SETUP.md).

Подробности: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) и [docs/PRIVACY.md](docs/PRIVACY.md).

На бесплатном тарифе проект Supabase может засыпать после недели без запросов. Приложение сохраняет локальный backup и показывает повтор при пробуждении.
