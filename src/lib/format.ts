import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('ru-RU')

export function formatMoney(kopecks: number) {
  return moneyFormatter.format(kopecks / 100)
}

export function formatInteger(value: number) {
  return integerFormatter.format(value)
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

export function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, 'd MMMM, HH:mm', { locale: ru })
}
