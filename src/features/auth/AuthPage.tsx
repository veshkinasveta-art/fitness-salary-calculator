import { ArrowRight, LockKeyhole, Mail, UsersRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!supabase) {
      navigate('/')
      return
    }
    setLoading(true)
    try {
      const result =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) setError(result.error.message)
      else navigate('/')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="card auth-card stack" aria-labelledby="auth-title">
        <div className="brand">
          <span className="brand-mark">
            <UsersRound size={20} />
          </span>
          <span className="brand-title">Зарплата студии</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <p className="eyebrow">Совместная работа</p>
          <h1 id="auth-title">
            {mode === 'login' ? 'Войти в студию' : 'Создать аккаунт'}
          </h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Расчёты доступны только участникам вашей команды.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="notice notice-warning">
            <LockKeyhole size={20} />
            <div>
              <strong>Демонстрационный режим</strong>
              <p className="muted small">
                Supabase ещё не подключён. Можно открыть интерфейс с тестовыми данными.
              </p>
            </div>
          </div>
        )}

        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <div style={{ position: 'relative' }}>
              <Mail
                size={18}
                style={{ position: 'absolute', left: 12, top: 15 }}
                aria-hidden="true"
              />
              <input
                className="input"
                style={{ paddingLeft: 40 }}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              className="input"
              type="password"
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            <ArrowRight size={18} />
          </button>
        </form>

        {!isSupabaseConfigured && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => navigate('/')}
          >
            Открыть демоверсию
          </button>
        )}

        <button
          type="button"
          className="button button-ghost"
          onClick={() => setMode((current) => (current === 'login' ? 'signup' : 'login'))}
        >
          {mode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
        </button>
      </section>
    </main>
  )
}
