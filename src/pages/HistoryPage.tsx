import { ArrowUpRight, CalendarRange, Copy, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useAppState } from '../app/AppState'
import type { PeriodRecord } from '../app/model'
import { formatDateTime, formatMoney, formatMonth, formatPercent } from '../lib/format'

function PeriodCard({
  period,
  onOpen,
}: {
  period: PeriodRecord
  onOpen: (period: PeriodRecord) => void
}) {
  return (
    <article className="card card-body stack">
      <div className="row-between">
        <div>
          <p className="eyebrow">{formatMonth(period.month)}</p>
          <h2>{formatMoney(period.result.totalSalaryKopecks)}</h2>
        </div>
        <span
          className={`status ${
            period.status === 'closed' ? 'status-success' : 'status-warning'
          }`}
        >
          {period.status === 'closed' ? (
            <LockKeyhole size={13} />
          ) : (
            <CalendarRange size={13} />
          )}
          {period.status === 'closed' ? 'Закрыт' : 'Черновик'}
        </span>
      </div>
      <div className="grid metric-grid">
        <div>
          <p className="muted small">Выручка</p>
          <p className="money">{formatMoney(period.result.totalRevenueKopecks)}</p>
        </div>
        <div>
          <p className="muted small">Выполнение</p>
          <p className="money">{formatPercent(period.result.completionPercent)}</p>
        </div>
      </div>
      <div className="row-between">
        <span className="muted small">
          Обновлён {formatDateTime(period.updatedAt)}
        </span>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => onOpen(period)}
        >
          Подробнее <ArrowUpRight size={17} />
        </button>
      </div>
    </article>
  )
}

export function HistoryPage() {
  const { history, duplicatePeriod } = useAppState()
  const [selected, setSelected] = useState<PeriodRecord | null>(null)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Зафиксированные данные</p>
          <h1>История расчётов</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Закрытые периоды не меняются при обновлении тарифов
          </p>
        </div>
      </header>

      {selected ? (
        <section className="card card-body stack" aria-label="Детали периода">
          <div className="row-between">
            <div>
              <p className="eyebrow">{formatMonth(selected.month)}</p>
              <h2>Расшифровка периода</h2>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setSelected(null)}
            >
              Назад
            </button>
          </div>
          <div className="grid metric-grid">
            <article className="card card-flat metric">
              <p className="metric-label">Выручка</p>
              <p className="metric-value">
                {formatMoney(selected.result.totalRevenueKopecks)}
              </p>
            </article>
            <article className="card card-flat metric">
              <p className="metric-label">Зарплата</p>
              <p className="metric-value">
                {formatMoney(selected.result.totalSalaryKopecks)}
              </p>
            </article>
            <article className="card card-flat metric">
              <p className="metric-label">Премиальный фонд</p>
              <p className="metric-value">
                {formatMoney(selected.result.bonusFundKopecks)}
              </p>
            </article>
            <article className="card card-flat metric">
              <p className="metric-label">План</p>
              <p className="metric-value">
                {formatPercent(selected.result.completionPercent)}
              </p>
            </article>
          </div>
          <div className="notice">
            <LockKeyhole size={20} aria-hidden="true" />
            <div>
              <strong>Неизменяемый снимок</strong>
              <p className="muted small">
                Результат хранит цены и правила, действовавшие при закрытии.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              duplicatePeriod(selected)
              setSelected(null)
            }}
          >
            <Copy size={17} /> Дублировать в новый период
          </button>
        </section>
      ) : history.length > 0 ? (
        <section className="grid settings-grid" aria-label="Периоды">
          {history.map((period) => (
            <PeriodCard key={period.id} period={period} onOpen={setSelected} />
          ))}
        </section>
      ) : (
        <div className="card empty-state">
          <div>
            <CalendarRange size={36} aria-hidden="true" />
            <h2 style={{ marginTop: 12 }}>История пока пуста</h2>
            <p className="muted" style={{ marginTop: 7 }}>
              Закройте первый расчётный период, и он появится здесь.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
