import {
  ArrowRight,
  BadgeRussianRuble,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  Target,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { formatMoney, formatMonth, formatPercent } from '../lib/format'

export function DashboardPage() {
  const { month, setMonth, employees, result, settings, syncState } = useAppState()
  const progress = Math.min(Math.max(result.completionPercent, 0), 120)
  const nextTier = [...settings.bonusTiers]
    .sort((a, b) => a.thresholdPercent - b.thresholdPercent)
    .find((tier) => result.completionPercent < tier.thresholdPercent)
  const toNextTier = nextTier
    ? Math.max(
        0,
        Math.ceil(
          (settings.teamPlanKopecks * nextTier.thresholdPercent) / 100 -
            result.totalRevenueKopecks,
        ),
      )
    : 0

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Обзор команды</p>
          <h1>{formatMonth(month)}</h1>
        </div>
        <label className="field" style={{ width: 148 }}>
          <span className="small">Период</span>
          <input
            className="input"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="Выбранный месяц"
          />
        </label>
      </header>

      {syncState !== 'synced' && (
        <div className="notice notice-warning">
          <CircleGauge size={20} aria-hidden="true" />
          <div>
            <strong>Расчёт пока в черновике</strong>
            <p className="muted small">
              Проверьте данные сотрудников и сохраните период.
            </p>
          </div>
        </div>
      )}

      <div className="grid dashboard-grid">
        <section className="hero-card" aria-label="Итоговая зарплата команды">
          <p className="hero-label">Зарплата команды</p>
          <p className="hero-value">{formatMoney(result.totalSalaryKopecks)}</p>
          <div className="hero-meta">
            <span>{employees.length} сотрудника</span>
            <span>Фонд: {formatMoney(result.bonusFundKopecks)}</span>
            <span>{formatPercent(result.completionPercent)} плана</span>
          </div>
        </section>

        <section className="card card-body stack" aria-labelledby="plan-title">
          <div className="row-between">
            <div>
              <p className="muted small" id="plan-title">
                Выполнение плана
              </p>
              <h2 style={{ marginTop: 4 }}>
                {formatPercent(result.completionPercent)}
              </h2>
            </div>
            <span className="avatar" aria-hidden="true">
              <Target size={21} />
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={Math.round(result.completionPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Выполнение командного плана"
          >
            <div
              className="progress-bar"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
            <span className="progress-marker" style={{ left: '80%' }} />
          </div>
          <div className="row-between small">
            <span>{formatMoney(result.totalRevenueKopecks)}</span>
            <span className="muted">из {formatMoney(settings.teamPlanKopecks)}</span>
          </div>
          {nextTier ? (
            <p className="small muted">
              До премии {formatPercent(nextTier.thresholdPercent, 0)} осталось{' '}
              {formatMoney(toNextTier)}
            </p>
          ) : (
            <p className="small" style={{ color: 'var(--success)' }}>
              Максимальный уровень премии достигнут
            </p>
          )}
        </section>
      </div>

      <section className="grid metric-grid" aria-label="Основные показатели">
        <article className="card card-flat metric">
          <p className="metric-label">Выручка</p>
          <p className="metric-value">{formatMoney(result.totalRevenueKopecks)}</p>
        </article>
        <article className="card card-flat metric">
          <p className="metric-label">Премиальный фонд</p>
          <p className="metric-value">{formatMoney(result.bonusFundKopecks)}</p>
        </article>
        <article className="card card-flat metric">
          <p className="metric-label">Сотрудников</p>
          <p className="metric-value">{employees.length}</p>
        </article>
        <article className="card card-flat metric">
          <p className="metric-label">План студии</p>
          <p className="metric-value">{formatMoney(settings.teamPlanKopecks)}</p>
        </article>
      </section>

      <section className="stack" aria-labelledby="employees-title">
        <div className="row-between">
          <div>
            <p className="eyebrow">Расшифровка</p>
            <h2 id="employees-title">Сотрудники</h2>
          </div>
          <Link className="button button-ghost" to="/input">
            Изменить <ArrowRight size={18} />
          </Link>
        </div>
        <div className="employee-list">
          {employees.map((employee) => {
            const employeeResult = result.employees.find(
              (item) => item.employeeId === employee.id,
            )
            if (!employeeResult) return null
            return (
              <article className="card employee-card" key={employee.id}>
                <span className="avatar">{employee.name.slice(0, 1)}</span>
                <div style={{ minWidth: 0 }}>
                  <p className="employee-name">{employee.name}</p>
                  <p className="muted small">
                    {formatMoney(employeeResult.revenueKopecks)} ·{' '}
                    {formatPercent(employeeResult.revenueShare)}
                  </p>
                  <div className="row" style={{ marginTop: 7, flexWrap: 'wrap' }}>
                    <span
                      className={`status ${
                        employeeResult.kpiReached
                          ? 'status-success'
                          : 'status-warning'
                      }`}
                    >
                      {employeeResult.kpiReached ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <CircleGauge size={13} />
                      )}
                      KPI {employeeResult.kpiReached ? 'выполнен' : 'в процессе'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="money">
                    {formatMoney(employeeResult.salaryKopecks)}
                  </p>
                  <p className="muted small">итого</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="card card-body grid metric-grid" aria-label="Состав зарплаты">
        <div>
          <BadgeRussianRuble size={20} aria-hidden="true" />
          <p className="muted small" style={{ marginTop: 7 }}>
            Смены
          </p>
          <p className="money">
            {formatMoney(
              result.employees.reduce(
                (sum, item) => sum + item.shiftsPayKopecks,
                0,
              ),
            )}
          </p>
        </div>
        <div>
          <UsersRound size={20} aria-hidden="true" />
          <p className="muted small" style={{ marginTop: 7 }}>
            Командная премия
          </p>
          <p className="money">{formatMoney(result.bonusFundKopecks)}</p>
        </div>
        <div>
          <CheckCircle2 size={20} aria-hidden="true" />
          <p className="muted small" style={{ marginTop: 7 }}>
            KPI
          </p>
          <p className="money">
            {formatMoney(
              result.employees.reduce(
                (sum, item) => sum + item.kpiBonusKopecks,
                0,
              ),
            )}
          </p>
        </div>
        <div>
          <CalendarDays size={20} aria-hidden="true" />
          <p className="muted small" style={{ marginTop: 7 }}>
            Период
          </p>
          <p className="money">{formatMonth(month)}</p>
        </div>
      </section>
    </div>
  )
}
