import {
  Cloud,
  Database,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  MailPlus,
  Monitor,
  Moon,
  Save,
  Sun,
  Upload,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useAppState } from '../app/AppState'
import type { StudioSettings } from '../app/model'
import { createBackup } from '../lib/backup'
import { formatMoney } from '../lib/format'
import { type ThemePreference, useTheme } from '../lib/theme'

function rublesToKopecks(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) return null
  const kopecks = Math.round(amount * 100)
  return Number.isSafeInteger(kopecks) ? kopecks : null
}

export function MorePage() {
  const {
    settings,
    updateSettings,
    syncState,
    lastSyncedAt,
    employees,
    history,
    products,
    month,
    importBackup,
    online,
  } = useAppState()
  const { preference, setPreference } = useTheme()
  const [draft, setDraft] = useState<StudioSettings>(settings)
  const [saved, setSaved] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const save = () => {
    updateSettings(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const exportBackup = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          createBackup({
            settings,
            employees,
            products,
            history,
            month,
          }),
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `salary-studio-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const exportCsv = () => {
    const rows = [
      ['Период', 'Статус', 'Выручка, коп.', 'Зарплата, коп.', 'Фонд, коп.'],
      ...history.map((period) => [
        period.month,
        period.status,
        period.result.totalRevenueKopecks,
        period.result.totalSalaryKopecks,
        period.result.bonusFundKopecks,
      ]),
    ]
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'salary-studio-report.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const themes: Array<{
    id: ThemePreference
    label: string
    icon: typeof Sun
  }> = [
    { id: 'system', label: 'Системная', icon: Monitor },
    { id: 'light', label: 'Светлая', icon: Sun },
    { id: 'dark', label: 'Тёмная', icon: Moon },
  ]

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Управление</p>
          <h1>Ещё и настройки</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Студия, расчёт, доступы и резервные копии
          </p>
        </div>
      </header>

      <section className="grid settings-grid">
        <article className="card card-body stack">
          <div className="row-between">
            <div>
              <p className="eyebrow">Облако</p>
              <h2>Supabase</h2>
            </div>
            <span
              className={`status ${
                syncState === 'synced' ? 'status-success' : 'status-warning'
              }`}
            >
              <Cloud size={14} />
              {syncState === 'synced' ? 'Синхронизировано' : 'Демо-режим'}
            </span>
          </div>
          <p className="muted small">
            Основная база, авторизация и совместный доступ команды.
          </p>
          <button type="button" className="button button-secondary">
            <Database size={17} /> Подключить Supabase
          </button>
        </article>

        <article className="card card-body stack">
          <div className="row-between">
            <div>
              <p className="eyebrow">Автоматическая копия</p>
              <h2>Google Таблица</h2>
            </div>
            <span className="status status-warning">
              <FileSpreadsheet size={14} />
              Не подключена
            </span>
          </div>
          <p className="muted small">
            После сохранения данные появятся в общей таблице через несколько секунд.
          </p>
          <button type="button" className="button button-secondary">
            <FileSpreadsheet size={17} /> Настроить таблицу
          </button>
        </article>
      </section>

      <section className="card card-body stack" aria-labelledby="studio-settings-title">
        <div>
          <p className="eyebrow">Правила</p>
          <h2 id="studio-settings-title">Настройки студии</h2>
        </div>
        <div className="grid settings-grid">
          <label className="field">
            <span>Название студии</span>
            <input
              className="input"
              value={draft.studioName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  studioName: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>Командный план, ₽</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.teamPlanKopecks / 100}
              onChange={(event) => {
                const value = rublesToKopecks(event.target.value)
                if (value !== null) {
                  setDraft((current) => ({
                    ...current,
                    teamPlanKopecks: value,
                  }))
                }
              }}
            />
          </label>
          <label className="field">
            <span>Стоимость смены, ₽</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.shiftCostKopecks / 100}
              onChange={(event) => {
                const value = rublesToKopecks(event.target.value)
                if (value !== null) {
                  setDraft((current) => ({
                    ...current,
                    shiftCostKopecks: value,
                  }))
                }
              }}
            />
          </label>
          <label className="field">
            <span>Размер KPI, ₽</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.kpiAmountKopecks / 100}
              onChange={(event) => {
                const value = rublesToKopecks(event.target.value)
                if (value !== null) {
                  setDraft((current) => ({
                    ...current,
                    kpiAmountKopecks: value,
                  }))
                }
              }}
            />
          </label>
          <label className="field">
            <span>Пробные для KPI</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.kpiTrials}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kpiTrials: Math.max(0, Number(event.target.value)),
                }))
              }
            />
          </label>
          <label className="field">
            <span>Абонементы для KPI</span>
            <input
              className="input"
              type="number"
              min={0}
              value={draft.kpiMemberships}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  kpiMemberships: Math.max(0, Number(event.target.value)),
                }))
              }
            />
          </label>
          <label className="field">
            <span>Распределение фонда</span>
            <select
              className="select"
              value={draft.distribution}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  distribution: event.target.value as StudioSettings['distribution'],
                }))
              }
            >
              <option value="proportional">Пропорционально выручке</option>
              <option value="equal">Поровну</option>
              <option value="weighted">По заданным весам</option>
            </select>
          </label>
          <div className="field">
            <span>Текущие значения</span>
            <div className="notice small">
              План {formatMoney(draft.teamPlanKopecks)} · смена{' '}
              {formatMoney(draft.shiftCostKopecks)}
            </div>
          </div>
        </div>
        <div className="row">
          <button type="button" className="button" onClick={save}>
            <Save size={17} />
            Сохранить настройки
          </button>
          {saved && <span className="status status-success">Сохранено</span>}
        </div>
      </section>

      <section className="card card-body stack" aria-labelledby="theme-title">
        <div>
          <p className="eyebrow">Внешний вид</p>
          <h2 id="theme-title">Тема</h2>
        </div>
        <div className="segmented">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              className={`segment ${preference === id ? 'segment-active' : ''}`}
              key={id}
              onClick={() => setPreference(id)}
            >
              <span className="row" style={{ justifyContent: 'center' }}>
                <Icon size={16} /> {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid settings-grid">
        <article className="card card-body stack">
          <p className="eyebrow">Команда</p>
          <h2>Доступы</h2>
          <div className="notice">
            <Users size={19} />
            <div>
              <strong>2 участника</strong>
              <p className="muted small">Владелец и менеджер</p>
            </div>
          </div>
          <button type="button" className="button button-secondary">
            <MailPlus size={17} /> Пригласить участника
          </button>
        </article>

        <article className="card card-body stack">
          <p className="eyebrow">Безопасность</p>
          <h2>Резервная копия</h2>
          <p className="muted small">
            Полный JSON можно восстановить на другом устройстве.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="button button-secondary" onClick={exportBackup}>
              <Download size={17} /> Скачать backup
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={17} /> Импорт
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  try {
                    importBackup(JSON.parse(String(reader.result)))
                  } catch {
                    window.alert('Файл резервной копии повреждён или устарел')
                  }
                }
                reader.readAsText(file)
                event.target.value = ''
              }}
            />
          </div>
        </article>
      </section>

      <section className="card card-body row-between">
        <div>
          <p className="eyebrow">Отчёт</p>
          <h2>Google Таблицы</h2>
          <p className="muted small" style={{ marginTop: 5 }}>
            Ручной резервный экспорт CSV
          </p>
        </div>
        <button type="button" className="button button-secondary" onClick={exportCsv}>
          <FileSpreadsheet size={17} /> CSV
        </button>
      </section>

      <div className="notice">
        <LockKeyhole size={19} />
        <p className="small">
          Зарплатные данные доступны только участникам студии согласно их роли.
          Последняя синхронизация:{' '}
          {lastSyncedAt ? lastSyncedAt.toLocaleTimeString('ru-RU') : 'не выполнялась'}.
          Сейчас {online ? 'есть сеть' : 'офлайн-режим'}.{' '}
          <Link to="/privacy">Политика конфиденциальности</Link>
        </p>
      </div>
    </div>
  )
}
