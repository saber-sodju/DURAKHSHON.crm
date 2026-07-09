import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Users, BookUser, HeartHandshake, Boxes,
  CalendarDays, ClipboardCheck, Wallet, FileSpreadsheet, BarChart3,
  ShieldCheck, Bell, Settings, LogOut, Menu, X, NotebookPen,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import type { RoleName } from '../lib/types'
import LanguageSwitcher from './LanguageSwitcher'

interface NavItem {
  to: string
  labelKey: string
  icon: ReactNode
  roles: RoleName[]
}

const NAV_SECTIONS: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'nav.overview',
    items: [
      { to: '/', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
  {
    titleKey: 'nav.manage',
    items: [
      { to: '/students', labelKey: 'nav.students', icon: <Users size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/teachers', labelKey: 'nav.teachers', icon: <BookUser size={18} />, roles: ['director', 'admin'] },
      { to: '/parents', labelKey: 'nav.parents', icon: <HeartHandshake size={18} />, roles: ['director', 'admin'] },
      { to: '/groups', labelKey: 'nav.groups', icon: <Boxes size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/schedule', labelKey: 'nav.schedule', icon: <CalendarDays size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
  {
    titleKey: 'nav.academics',
    items: [
      { to: '/attendance', labelKey: 'nav.attendance', icon: <ClipboardCheck size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
      { to: '/exams', labelKey: 'nav.exams', icon: <NotebookPen size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/grades', labelKey: 'nav.grades', icon: <FileSpreadsheet size={18} />, roles: ['director', 'admin', 'student', 'parent'] },
    ],
  },
  {
    titleKey: 'nav.reportsSection',
    items: [
      { to: '/payments', labelKey: 'nav.payments', icon: <Wallet size={18} />, roles: ['director', 'admin', 'student', 'parent'] },
      { to: '/reports', labelKey: 'nav.reports', icon: <BarChart3 size={18} />, roles: ['director', 'admin'] },
    ],
  },
  {
    titleKey: 'nav.system',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: <ShieldCheck size={18} />, roles: ['director', 'admin'] },
      { to: '/notifications', labelKey: 'nav.notifications', icon: <Bell size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
      { to: '/settings', labelKey: 'nav.settings', icon: <Settings size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
]

function SidebarContent({ role, onNavigate }: { role: RoleName; onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/logo.webp" alt="DURAKHSHON" className="h-10 w-10 rounded-xl ring-1 ring-white/10" />
        <span className="text-lg font-extrabold tracking-wide text-white">DURAKHSHON</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => i.roles.includes(role))
          if (items.length === 0) return null
          return (
            <div key={section.titleKey} className="mt-4">
              <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                {t(section.titleKey)}
              </div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => cn(
                    'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                  )}
                >
                  {item.icon}
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>
    </>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get<{ unread: number }>('/notifications/unread-count')).data,
    refetchInterval: 60_000,
  })

  if (!user) return null

  return (
    <div className="flex h-full">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 lg:flex">
        <SidebarContent role={user.role} />
      </aside>

      {/* mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900">
            <button onClick={() => setMobileOpen(false)}
                    className="absolute right-3 top-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <SidebarContent role={user.role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 lg:hidden"
                  onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1.5 sm:gap-3">
            <LanguageSwitcher />
            <button
              onClick={() => navigate('/notifications')}
              className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
              title={t('layout.notifications')}
            >
              <Bell size={19} />
              {(unread?.unread ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread!.unread > 99 ? '99+' : unread!.unread}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2.5 rounded-full bg-blue-50 p-1.5 sm:py-1.5 sm:pl-2 sm:pr-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {(user.full_name || user.username).slice(0, 1).toUpperCase()}
              </span>
              <div className="hidden leading-tight sm:block">
                <div className="text-xs font-bold text-slate-800">{user.full_name || user.username}</div>
                <div className="text-[11px] font-semibold text-blue-600">{t(`common.badge.${user.role}`)}</div>
              </div>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/login') }}
              className="rounded-full p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
              title={t('layout.logout')}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
