import { useTranslation } from 'react-i18next'

export function useDayNames(): string[] {
  const { t } = useTranslation()
  return t('common.days', { returnObjects: true }) as string[]
}

export function useMonthNames(): string[] {
  const { t } = useTranslation()
  return t('common.months', { returnObjects: true }) as string[]
}
