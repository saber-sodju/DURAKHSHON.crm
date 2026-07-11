import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { greetingKey, formatDateWithWeekday, cn } from '../lib/utils'

export interface DashboardAlert {
  icon: ReactNode
  labelKey: string
  count: number
  tone: 'red' | 'amber' | 'blue'
}

const toneClasses: Record<DashboardAlert['tone'], string> = {
  red: 'border-red-100 bg-red-50 text-red-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
}

export default function MobileDashboardHero({ actionLabel, actionIcon, onAction, alerts }: {
  actionLabel: string
  actionIcon: ReactNode
  onAction: () => void
  alerts?: DashboardAlert[]
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const name = user?.full_name || user?.username || ''
  const visibleAlerts = (alerts ?? []).filter((a) => a.count > 0)

  return (
    <div className="mb-5 lg:hidden">
      <div className="text-2xl font-extrabold text-slate-900">{t(`dashboard.${greetingKey()}`, { name })}</div>
      <div className="mt-0.5 text-sm font-medium text-[color:var(--color-mobile-muted)]">{formatDateWithWeekday()}</div>

      <button
        onClick={onAction}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-md shadow-blue-600/20 transition-transform active:scale-[0.98]"
      >
        {actionIcon} {actionLabel}
      </button>

      {visibleAlerts.length > 0 && (
        <div className="mt-3 space-y-2">
          {visibleAlerts.map((a, i) => (
            <div key={i} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-sm font-bold', toneClasses[a.tone])}>
              {a.icon}
              <span>{t(a.labelKey, { count: a.count })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
