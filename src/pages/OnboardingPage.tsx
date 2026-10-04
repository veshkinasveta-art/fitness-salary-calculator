import { ArrowRight, Building2, FileSpreadsheet, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const steps = [
  {
    icon: Building2,
    title: 'Создайте профиль студии',
    text: 'Название, валюта и правила расчётного периода.',
  },
  {
    icon: UsersRound,
    title: 'Добавьте сотрудников',
    text: 'Укажите роли, стоимость смен и индивидуальные условия.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Подключите Google Таблицу',
    text: 'Сохранённые данные будут автоматически копироваться в понятный отчёт.',
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const current = steps[step]
  const Icon = current.icon

  return (
    <main className="auth-shell">
      <section className="card auth-card stack">
        <div className="row-between">
          <span className="status">Шаг {step + 1} из {steps.length}</span>
          <ShieldCheck size={22} color="var(--primary)" aria-hidden="true" />
        </div>
        <span className="avatar" style={{ width: 56, height: 56 }}>
          <Icon size={26} />
        </span>
        <div>
          <p className="eyebrow">Первоначальная настройка</p>
          <h1>{current.title}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {current.text}
          </p>
        </div>
        <div className="progress">
          <div
            className="progress-bar"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <button
          type="button"
          className="button"
          onClick={() =>
            step === steps.length - 1 ? navigate('/') : setStep((value) => value + 1)
          }
        >
          {step === steps.length - 1 ? 'Открыть приложение' : 'Продолжить'}
          <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => navigate('/')}
        >
          Пропустить настройку
        </button>
      </section>
    </main>
  )
}
