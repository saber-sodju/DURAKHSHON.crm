import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import type { RoleName } from './lib/types'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentDetails from './pages/StudentDetails'
import Teachers from './pages/Teachers'
import Parents from './pages/Parents'
import ParentDetails from './pages/ParentDetails'
import Groups from './pages/Groups'
import GroupDetails from './pages/GroupDetails'
import SchedulePage from './pages/SchedulePage'
import Attendance from './pages/Attendance'
import Payments from './pages/Payments'
import Exams from './pages/Exams'
import Grades from './pages/Grades'
import Reports from './pages/Reports'
import UsersPage from './pages/UsersPage'
import Notifications from './pages/Notifications'
import SettingsPage from './pages/SettingsPage'

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  )
}

function Protected({ roles, children }: { roles?: RoleName[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  // a freshly generated (or reset) password must be changed before anything else
  if (user.must_change_password && location.pathname !== '/settings') return <Navigate to="/settings" replace />
  return <>{children}</>
}

const STAFF: RoleName[] = ['director', 'admin']

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<Protected roles={[...STAFF, 'teacher']}><Students /></Protected>} />
        <Route path="/students/:id" element={<StudentDetails />} />
        <Route path="/teachers" element={<Protected roles={STAFF}><Teachers /></Protected>} />
        <Route path="/parents" element={<Protected roles={STAFF}><Parents /></Protected>} />
        <Route path="/parents/:id" element={<Protected roles={STAFF}><ParentDetails /></Protected>} />
        <Route path="/groups" element={<Protected roles={[...STAFF, 'teacher']}><Groups /></Protected>} />
        <Route path="/groups/:id" element={<GroupDetails />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/payments" element={<Protected roles={[...STAFF, 'student', 'parent']}><Payments /></Protected>} />
        <Route path="/exams" element={<Protected roles={[...STAFF, 'teacher']}><Exams /></Protected>} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/reports" element={<Protected roles={STAFF}><Reports /></Protected>} />
        <Route path="/users" element={<Protected roles={STAFF}><UsersPage /></Protected>} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
