import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { SetupDialog } from '../../components/SetupDialog'

export function InviteDialog({
  studioName,
  onClose,
}: {
  studioName: string
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const inviteText = `Приглашение в «${studioName}». Откройте https://veshkinasveta-art.github.io/ и войдите с адресом ${email || 'вашей почты'}.`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.prompt('Скопируйте приглашение', inviteText)
    }
  }

  return (
    <SetupDialog title="Пригласить участника" onClose={onClose}>
      <p className="muted">
        Отправьте коллеге ссылку на приложение и его рабочую почту. После
        подключения Supabase приглашение можно будет принять в один клик.
      </p>
      <label className="field">
        <span>Email коллеги</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <div className="notice small">{inviteText}</div>
      <button type="button" className="button" onClick={() => void copy()}>
        {copied ? <Check size={17} /> : <Copy size={17} />}
        {copied ? 'Скопировано' : 'Скопировать приглашение'}
      </button>
    </SetupDialog>
  )
}
