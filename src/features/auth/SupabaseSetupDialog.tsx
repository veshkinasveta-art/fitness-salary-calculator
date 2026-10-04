import { Check } from 'lucide-react'
import { useState } from 'react'
import { SetupDialog } from '../../components/SetupDialog'
import { isSupabaseConfigured, saveSupabaseConfig } from '../../lib/supabase'

export function SupabaseSetupDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [error, setError] = useState('')

  const save = () => {
    const nextUrl = url.trim()
    const nextKey = anonKey.trim()
    if (!nextUrl.startsWith('https://') || !nextKey) {
      setError('Нужны адрес проекта Supabase и публичный anon-ключ')
      return
    }
    saveSupabaseConfig(nextUrl, nextKey)
    window.location.reload()
  }

  return (
    <SetupDialog title="Подключить Supabase" onClose={onClose}>
      <p className="muted">
        {isSupabaseConfigured
          ? 'Облако уже подключено. Можно заменить проект новыми данными.'
          : 'Создайте бесплатный проект на supabase.com и вставьте публичные данные сюда.'}
      </p>
      <label className="field">
        <span>Адрес проекта</span>
        <input
          className="input"
          type="url"
          placeholder="https://xxxx.supabase.co"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            setError('')
          }}
        />
      </label>
      <label className="field">
        <span>Публичный anon-ключ</span>
        <input
          className="input"
          type="text"
          autoComplete="off"
          value={anonKey}
          onChange={(event) => {
            setAnonKey(event.target.value)
            setError('')
          }}
        />
      </label>
      {error && <p className="field-error">{error}</p>}
      <p className="muted small">
        Service-role ключ сюда вставлять нельзя. Он остаётся только в кабинете
        Supabase.
      </p>
      <button type="button" className="button" onClick={save}>
        <Check size={17} />
        Сохранить и перезагрузить
      </button>
    </SetupDialog>
  )
}
