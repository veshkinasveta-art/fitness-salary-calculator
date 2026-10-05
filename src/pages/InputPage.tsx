import { Check, Minus, Plus, Save, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppState } from '../app/AppState'
import { formatMoney, formatMonth } from '../lib/format'

function Counter({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  return (
    <div className="counter" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label={`Уменьшить: ${label}`}
      >
        <Minus size={17} />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`Увеличить: ${label}`}
      >
        <Plus size={17} />
      </button>
    </div>
  )
}

export function InputPage() {
  const {
    month,
    employees,
    products,
    result,
    syncState,
    updateEmployee,
    updateSale,
    addEmployee,
    saveDraft,
    closePeriod,
    settings,
  } = useAppState()
  const [activeEmployeeId, setActiveEmployeeId] = useState(employees[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const activeEmployee =
    employees.find((employee) => employee.id === activeEmployeeId) ?? employees[0]
  const employeeResult = result.employees.find(
    (item) => item.employeeId === activeEmployee?.id,
  )
  const kpiTrialsProgress = activeEmployee
    ? `${activeEmployee.trials}`
    : '0'
  const memberships = useMemo(
    () =>
      activeEmployee
        ? Object.values(activeEmployee.sales).reduce((sum, value) => sum + value, 0)
        : 0,
    [activeEmployee],
  )

  const runSave = async (close = false) => {
    setSaving(true)
    setSaveError('')
    try {
      if (close) await closePeriod()
      else await saveDraft()
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Не удалось сохранить данные',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!activeEmployee) return null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{formatMonth(month)}</p>
          <h1>Ввод показателей</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Изменения автоматически считаются в черновике
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={addEmployee}
          aria-label="Добавить сотрудника"
          title="Добавить сотрудника"
        >
          <UserPlus size={20} />
        </button>
      </header>

      <div className="segmented" role="tablist" aria-label="Сотрудники">
        {employees.map((employee) => (
          <button
            type="button"
            role="tab"
            aria-selected={employee.id === activeEmployee.id}
            className={`segment ${
              employee.id === activeEmployee.id ? 'segment-active' : ''
            }`}
            key={employee.id}
            onClick={() => setActiveEmployeeId(employee.id)}
          >
            {employee.name}
          </button>
        ))}
      </div>

      <section className="card card-body stack" aria-labelledby="employee-data-title">
        <div className="row-between">
          <div>
            <p className="eyebrow">Сотрудник</p>
            <h2 id="employee-data-title">{activeEmployee.name}</h2>
          </div>
          <span className="status status-warning">
            {syncState === 'synced' ? <Check size={14} /> : null}
            {syncState === 'synced' ? 'Сохранено' : 'Черновик'}
          </span>
        </div>
        <div className="grid settings-grid">
          <label className="field">
            <span>Имя</span>
            <input
              className="input"
              value={activeEmployee.name}
              onChange={(event) =>
                updateEmployee(activeEmployee.id, { name: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Роль</span>
            <input
              className="input"
              value={activeEmployee.role}
              onChange={(event) =>
                updateEmployee(activeEmployee.id, { role: event.target.value })
              }
            />
          </label>
        </div>
        <div className="grid settings-grid">
          <div className="field">
            <label>Смены</label>
            <Counter
              label="Количество смен"
              value={activeEmployee.shifts}
              onChange={(value) =>
                updateEmployee(activeEmployee.id, { shifts: value })
              }
            />
          </div>
          <div className="field">
            <label>Пробные тренировки</label>
            <Counter
              label="Количество пробных тренировок"
              value={activeEmployee.trials}
              onChange={(value) =>
                updateEmployee(activeEmployee.id, { trials: value })
              }
            />
          </div>
        </div>
      </section>

      <section className="card card-body" aria-labelledby="sales-title">
        <div className="row-between" style={{ marginBottom: 6 }}>
          <div>
            <p className="eyebrow">Личные продажи</p>
            <h2 id="sales-title">Абонементы</h2>
          </div>
          <span className="money">
            {formatMoney(employeeResult?.revenueKopecks ?? 0)}
          </span>
        </div>
        {products
          .filter((product) => product.active)
          .map((product) => (
            <div className="product-row" key={product.id}>
              <div>
                <h3>{product.name}</h3>
                <p className="muted small">
                  {formatMoney(product.priceKopecks)} за абонемент
                </p>
              </div>
              <Counter
                label={product.name}
                value={activeEmployee.sales[product.id] ?? 0}
                onChange={(value) =>
                  updateSale(activeEmployee.id, product.id, value)
                }
              />
            </div>
          ))}
      </section>

      <section className="card card-body stack" aria-labelledby="kpi-title">
        <div className="row-between">
          <h2 id="kpi-title">Прогресс KPI</h2>
          <span
            className={`status ${
              employeeResult?.kpiReached ? 'status-success' : 'status-warning'
            }`}
          >
            {employeeResult?.kpiReached ? 'Выполнен' : 'Не выполнен'}
          </span>
        </div>
        <div className="grid settings-grid">
          <div>
            <div className="row-between small">
              <span>Пробные</span>
              <strong>
                {kpiTrialsProgress} / {settings.kpiTrials}
              </strong>
            </div>
            <div className="progress" style={{ marginTop: 7 }}>
              <div
                className="progress-bar"
                style={{
                  width: `${Math.min(
                    100,
                    settings.kpiTrials === 0
                      ? 100
                      : (activeEmployee.trials / settings.kpiTrials) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="row-between small">
              <span>Абонементы</span>
              <strong>
                {memberships} / {settings.kpiMemberships}
              </strong>
            </div>
            <div className="progress" style={{ marginTop: 7 }}>
              <div
                className="progress-bar"
                style={{
                  width: `${Math.min(
                    100,
                    settings.kpiMemberships === 0
                      ? 100
                      : (memberships / settings.kpiMemberships) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="sticky-summary">
        {saveError && (
          <p className="field-error" role="alert" style={{ marginBottom: 8 }}>
            {saveError}
          </p>
        )}
        <div className="row-between">
          <div>
            <p className="muted small">Прогноз зарплаты</p>
            <p className="money" style={{ fontSize: '1.2rem' }}>
              {formatMoney(employeeResult?.salaryKopecks ?? 0)}
            </p>
          </div>
          <div className="row">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => runSave(false)}
              disabled={saving}
            >
              <Save size={17} />
              <span className="desktop-only">Сохранить</span>
            </button>
            <button
              type="button"
              className="button"
              onClick={() => runSave(true)}
              disabled={saving}
            >
              <Check size={17} />
              Закрыть период
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
