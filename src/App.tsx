import { Navigate, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './app/AppState'
import { AppShell } from './components/AppShell'
import { AuthPage } from './features/auth/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { InputPage } from './pages/InputPage'
import { MorePage } from './pages/MorePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PrivacyPage } from './pages/PrivacyPage'

function App() {
  return (
    <AppStateProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="input" element={<InputPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="more" element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppStateProvider>
  )
}

export default App
