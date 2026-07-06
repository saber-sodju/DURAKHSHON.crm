import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  GraduationCap, LayoutDashboard, Users, BookUser, HeartHandshake, Boxes,
  CalendarDays, ClipboardCheck, Wallet, FileSpreadsheet, BarChart3,
  ShieldCheck, Bell, Settings, LogOut, Menu, X, NotebookPen,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import type { RoleName } from '../lib/types'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  roles: RoleName[]
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
  {
    title: 'Manage',
    items: [
      { to: '/students', label: 'Students', icon: <Users size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/teachers', label: 'Teachers', icon: <BookUser size={18} />, roles: ['director', 'admin'] },
      { to: '/parents', label: 'Parents', icon: <HeartHandshake size={18} />, roles: ['director', 'admin'] },
      { to: '/groups', label: 'Groups', icon: <Boxes size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/schedule', label: 'Schedule', icon: <CalendarDays size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
  {
    title: 'Academics',
    items: [
      { to: '/attendance', label: 'Attendance', icon: <ClipboardCheck size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
      { to: '/exams', label: 'Exams', icon: <NotebookPen size={18} />, roles: ['director', 'admin', 'teacher'] },
      { to: '/grades', label: 'Grades', icon: <FileSpreadsheet size={18} />, roles: ['director', 'admin', 'student', 'parent'] },
    ],
  },
  {
    title: 'Reports',
    items: [
      { to: '/payments', label: 'Payments', icon: <Wallet size={18} />, roles: ['director', 'admin', 'student', 'parent'] },
      { to: '/reports', label: 'Reports', icon: <BarChart3 size={18} />, roles: ['director', 'admin'] },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/users', label: 'Users & Roles', icon: <ShieldCheck size={18} />, roles: ['director', 'admin'] },
      { to: '/notifications', label: 'Notifications', icon: <Bell size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} />, roles: ['director', 'admin', 'teacher', 'student', 'parent'] },
    ],
  },
]

function SidebarContent({ role, onNavigate }: { role: RoleName; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <GraduationCap size={28} className="text-blue-400" />
        <span className="text-lg font-extrabold tracking-wide text-white">DURAKHSHON</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => i.roles.includes(role))
          if (items.length === 0) return null
          return (
            <div key={section.title} className="mt-4">
              <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                {section.title}
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
                  {item.label}
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/notifications')}
              className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
              title="Notifications"
            >
              <Bell size={19} />
              {(unread?.unread ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread!.unread > 99 ? '99+' : unread!.unread}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2.5 rounded-full bg-blue-50 py-1.5 pl-2 pr-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {(user.full_name || user.username).slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight">
                <div className="text-xs font-bold text-slate-800">{user.full_name || user.username}</div>
                <div className="text-[11px] font-semibold capitalize text-blue-600">{user.role}</div>
              </div>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/login') }}
              className="rounded-full p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
              title="Log out"
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
