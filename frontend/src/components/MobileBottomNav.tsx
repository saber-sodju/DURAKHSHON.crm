import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Users, Boxes, ClipboardCheck, Wallet,
  FileSpreadsheet, CalendarDays, MoreHorizontal,
} from 'lucide-react'
import type { RoleName } from '../lib/types'
import { cn } from '../lib/utils'

interface TabItem {
  to: string
  labelKey: string
  icon: ReactNode
}

const HOME: TabItem = { to: '/', labelKey: 'bottomNav.home', icon: <LayoutDashboard size={20} /> }

const TABS_BY_ROLE: Record<RoleName, TabItem[]> = {
  director: [
    HOME,
    { to: '/students', labelKey: 'nav.students', icon: <Users size={20} /> },
    { to: '/payments', labelKey: 'nav.payments', icon: <Wallet size={20} /> },
    { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={20} /> },
  ],
  admin: [
    HOME,
    { to: '/students', labelKey: 'nav.students', icon: <Users size={20} /> },
    { to: '/payments', labelKey: 'nav.payments', icon: <Wallet size={20} /> },
    { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={20} /> },
  ],
  teacher: [
    HOME,
    { to: '/groups', labelKey: 'nav.groups', icon: <Boxes size={20} /> },
    { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={20} /> },
    { to: '/exams', labelKey: 'nav.exams', icon: <FileSpreadsheet size={20} /> },
  ],
  parent: [
    HOME,
    { to: '/grades', labelKey: 'nav.grades', icon: <FileSpreadsheet size={20} /> },
    { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={20} /> },
    { to: '/payments', labelKey: 'nav.payments', icon: <Wallet size={20} /> },
  ],
  student: [
    HOME,
    { to: '/schedule', labelKey: 'nav.schedule', icon: <CalendarDays size={20} /> },
    { to: '/grades', labelKey: 'nav.grades', icon: <FileSpreadsheet size={20} /> },
    { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={20} /> },
  ],
}

export default function MobileBottomNav({ role, onMore }: { role: RoleName; onMore: () => void }) {
  const { t } = useTranslation()
  const tabs = TABS_BY_ROLE[role] ?? [HOME]

  return (
    <nav
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ boxShadow: '0 -2px 14px rgba(15, 23, 42, 0.08)' }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
            isActive ? 'text-blue-600' : 'text-slate-400',
          )}
        >
          {({ isActive }) => (
            <>
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', isActive && 'bg-blue-50')}>
                {tab.icon}
              </span>
              <span className="truncate">{t(tab.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold text-slate-400"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl"><MoreHorizontal size={20} /></span>
        <span className="truncate">{t('bottomNav.more')}</span>
      </button>
    </nav>
  )
}
