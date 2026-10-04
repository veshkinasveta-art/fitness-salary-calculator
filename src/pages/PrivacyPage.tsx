import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <main className="auth-shell">
      <article className="card auth-card stack">
        <p className="eyebrow">Документы</p>
        <h1>Политика конфиденциальности</h1>
        <p>
          Приложение хранит зарплатные данные только для участников вашей студии.
          Основная база — ваш проект Supabase. Локальные черновики остаются в
          браузере (IndexedDB) и не кэшируются service worker.
        </p>
        <p>
          Копия в Google Таблице создаётся односторонне: таблица не является
          источником данных и не отправляет изменения обратно в приложение.
        </p>
        <p>
          В публичный репозиторий не попадают пароли, service-role ключи и
          ключи сервисного аккаунта Google.
        </p>
        <Link className="button" to="/">
          Вернуться в приложение
        </Link>
      </article>
    </main>
  )
}
