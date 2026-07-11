import i18n from '../i18n'

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // date wording follows the interface language, with graceful fallbacks
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en'
  return date.toLocaleDateString([lang, 'ru-RU', 'en-US'], { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  // currency label follows the interface language (TJS / смн); components re-render
  // on language change, so reading it imperatively here stays in sync
  return `${num.toFixed(2)} ${i18n.t('common.currency')}`
}

export function formatTime(value: string): string {
  return value.slice(0, 5)
}

/** time-of-day greeting key for the mobile dashboard hero ("Good morning, {{name}}!" etc.) */
export function greetingKey(date: Date = new Date()): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' | 'greetingNight' {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'greetingMorning'
  if (hour >= 12 && hour < 18) return 'greetingAfternoon'
  if (hour >= 18 && hour < 23) return 'greetingEvening'
  return 'greetingNight'
}

export function formatDateWithWeekday(date: Date = new Date()): string {
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en'
  return date.toLocaleDateString([lang, 'ru-RU', 'en-US'], {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}
