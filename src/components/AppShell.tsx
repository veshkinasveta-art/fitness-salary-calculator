import {
  ChartNoAxesCombined,
  CircleDollarSign,
  CloudCheck,
  History,
  MoreHorizontal,
  Moon,
  Sun,
  UsersRound,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { formatDateTime } from '../lib/format'
import { useTheme } from '../lib/theme'

const navigation = [
  { to: '/', label: 'Обзор', icon: ChartNoAxesCombined },
  { to: '/input', label: 'Ввод', icon: CircleDollarSign },
  { to: '/history', label: 'История', icon: History },
  { to: '/more', label: 'Ещё', icon: MoreHorizontal },
]

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <UsersRound size={20} />
      </span>
      <span className="brand-title">Зарплата студии</span>
    </div>
  )
}

function NavItems({ desktop = false }: { desktop?: boolean }) {
  return (
    <>
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `nav-item${isActive ? ' nav-item-active' : ''}`
          }
        >
          <Icon size={desktop ? 20 : 21} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  )
}

export function AppShell() {
  const { preference, resolved, setPreference } = useTheme()
  const { syncState, lastSyncedAt, settings } = useAppState()
  const toggleTheme = () =>
    setPreference(resolved === 'dark' ? 'light' : 'dark')

  return (
    <div className="app">
      <aside className="side-nav" role="navigation" aria-label="Основная навигация">
        <Brand />
        <NavItems desktop />
        <div style={{ marginTop: 'auto' }}>
          <div className="notice small">
            <CloudCheck size={18} aria-hidden="true" />
            <span>
              {syncState === 'synced'
                ? 'Данные синхронизированы'
                : 'Данные сохранены локально'}
            </span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="desktop-only">
              <span className="muted small">{settings.studioName}</span>
            </div>
            <div className="brand" style={{ display: 'flex' }}>
              <span className="desktop-only" />
              <span className="brand-title" style={{ fontSize: '0.94rem' }}>
                {syncState === 'synced'
                  ? `Сохранено ${lastSyncedAt ? formatDateTime(lastSyncedAt) : ''}`
                  : syncState === 'pending'
                    ? 'Есть несохранённые изменения'
                    : 'Локальный режим'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={
              resolved === 'dark'
                ? 'Включить светлую тему'
                : 'Включить тёмную тему'
            }
            title={`Тема: ${preference}`}
          >
            {resolved === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="app-layout">
        <div className="content">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <NavItems />
      </nav>
    </div>
  )
}
