import { Check, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { SetupDialog } from '../../components/SetupDialog'
import { parseSpreadsheetId, spreadsheetUrl } from '../../lib/googleSheet'

const CREATE_SHEET_URL = 'https://docs.google.com/spreadsheets/create'

export function SheetsSetupDialog({
  currentId,
  onClose,
  onSave,
}: {
  currentId?: string
  onClose: () => void
  onSave: (spreadsheetId: string) => void
}) {
  const [value, setValue] = useState(
    currentId ? spreadsheetUrl(currentId) : '',
  )
  const [error, setError] = useState('')
  const parsed = parseSpreadsheetId(value)

  const save = () => {
    if (!parsed) {
      setError('Вставьте ссылку на Google Таблицу или её идентификатор')
      return
    }
    onSave(parsed)
    onClose()
  }

  return (
    <SetupDialog title="Подключить Google Таблицу" onClose={onClose}>
      <p className="muted">
        Сохранённые в приложении данные будут копироваться в эту таблицу. В
        таблице ничего менять не нужно — она только для просмотра.
      </p>
      <ol className="setup-steps">
        <li>Создайте новую таблицу или откройте уже существующую.</li>
        <li>Скопируйте ссылку из адресной строки браузера.</li>
        <li>Вставьте ссылку сюда и сохраните.</li>
      </ol>
      <a
        className="button button-secondary"
        href={CREATE_SHEET_URL}
        target="_blank"
        rel="noreferrer"
      >
        <FileSpreadsheet size={17} />
        Создать таблицу
        <ExternalLink size={16} />
      </a>
      <label className="field">
        <span>Ссылка на таблицу</span>
        <input
          className="input"
          type="url"
          autoComplete="off"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
        />
      </label>
      {error && <p className="field-error">{error}</p>}
      {parsed && (
        <p className="muted small">Идентификатор таблицы: {parsed}</p>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="button" onClick={save}>
          <Check size={17} />
          Сохранить таблицу
        </button>
        {currentId && (
          <a
            className="button button-secondary"
            href={spreadsheetUrl(currentId)}
            target="_blank"
            rel="noreferrer"
          >
            Открыть текущую
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </SetupDialog>
  )
}
