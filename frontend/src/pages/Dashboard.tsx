import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users, BookUser, Boxes, Wallet, UserPlus, CalendarPlus, ClipboardCheck, BadgeDollarSign,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Card, StatCard, Badge, Button, TableShell, Th, Td, EmptyState } from '../components/ui'
import PageHeader from '../components/PageHeader'
import { formatMoney, formatDate } from '../lib/utils'

interface StaffDash {
  role: 'staff'
  active_students: number
  active_teachers: number
  active_groups: number
  payments_this_month: Record<string, number>
  attendance_today: Record<string, number>
  recent_students: { id: number; name: string; status: string; parent: string | null }[]
  recent_payments: { id: number; student: string; group: string; status: string; amount: number }[]
  upcoming_payments: { id: number; student: string; amount: number; due_date: string | null }[]
  todays_classes: { group: string; start_time: string; end_time: string; teacher: string | null; room: string }[]
}

interface TeacherDash {
  role: 'teacher'
  my_groups: { id: number; name: string; course: string; students: number }[]
  todays_lessons: { group_id: number; group: string; start_time: string; end_time: string; room: string }[]
  attendance_today: Record<string, number>
  recent_grades: { student: string; exam: string; score: number; percentage: number }[]
}

interface StudentPayload {
  id: number
  name: string
  groups: { id: number; name: string; course: string }[]
  attendance: { present: number; absent: number; late: number; excused: number; percentage: number | null }
  recent_grades: { exam: string; score: number; percentage: number; label: string; date: string | null }[]
  next_payment: { amount_due: number; due_date: string | null; status: string; month: number; year: number } | null
}

type Dash = StaffDash | TeacherDash | { role: 'student'; me: StudentPayload } | { role: 'parent'; children: StudentPayload[] }

interface Charts {
  payments_by_month: { month: string; collected: number; expected: number }[]
  attendance_trend: { date: string; present: number; absent: number; late: number; excused: number }[]
  student_growth: { month: string; students: number }[]
}

function AttendanceTodayCards({ stats }: { stats: Record<string, number> }) {
  const { t } = useTranslation()
  const cards = [
    { key: 'present', label: t('dashboard.todayPresent'), color: 'border-emerald-500 text-emerald-600' },
    { key: 'absent', label: t('dashboard.todayAbsent'), color: 'border-red-500 text-red-600' },
    { key: 'late', label: t('dashboard.todayLate'), color: 'border-amber-500 text-amber-600' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.key} className={`border-l-4 p-5 ${c.color.split(' ')[0]}`}>
          <div className="text-sm text-slate-500">{c.label}</div>
          <div className={`mt-1 text-3xl font-extrabold ${c.color.split(' ')[1]}`}>{stats[c.key] ?? 0}</div>
        </Card>
      ))}
    </div>
  )
}

function StaffDashboard({ data }: { data: StaffDash }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const { data: charts } = useQuery({
    queryKey: ['reports', 'charts'],
    queryFn: async () => (await api.get<Charts>('/reports/charts')).data,
  })
  const paid = data.payments_this_month.paid ?? 0
  const unpaidTotal = (data.payments_this_month.unpaid ?? 0) + (data.payments_this_month.overdue ?? 0)

  return (
    <>
      <PageHeader
        title={t('dashboard.staffTitle', { name: user?.full_name || user?.username })}
        subtitle={t('dashboard.staffSubtitle')}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users size={22} className="text-blue-600" />} accent="bg-blue-50"
                  value={data.active_students} label={t('dashboard.activeStudents')} />
        <StatCard icon={<BookUser size={22} className="text-emerald-600" />} accent="bg-emerald-50"
                  value={data.active_teachers} label={t('dashboard.activeTeachers')} />
        <StatCard icon={<Boxes size={22} className="text-cyan-600" />} accent="bg-cyan-50"
                  value={data.active_groups} label={t('dashboard.activeGroups')} />
        <StatCard icon={<Wallet size={22} className="text-amber-600" />} accent="bg-amber-50"
                  value={`${paid} / ${unpaidTotal}`} label={t('dashboard.paidUnpaidMonth')} />
      </div>

      <div className="mt-6">
        <AttendanceTodayCards stats={data.attendance_today} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold text-slate-800">{t('dashboard.recentStudents')}</h2>
            <Link to="/students"><Button variant="secondary" size="sm">{t('common.viewAll')}</Button></Link>
          </div>
          {data.recent_students.length === 0 ? <EmptyState title={t('dashboard.noStudentsYet')} /> : (
            <TableShell>
              <thead><tr><Th>{t('students.columnName')}</Th><Th>{t('students.columnParent')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/students/${s.id}`} className="font-semibold text-blue-600 hover:underline">
                        {s.name}
                      </Link>
                    </Td>
                    <Td>{s.parent ?? '—'}</Td>
                    <Td><Badge value={s.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold text-slate-800">{t('dashboard.recentPayments')}</h2>
            <Link to="/payments"><Button variant="secondary" size="sm">{t('common.viewAll')}</Button></Link>
          </div>
          {data.recent_payments.length === 0 ? <EmptyState title={t('dashboard.noPaymentsYet')} /> : (
            <TableShell>
              <thead><tr><Th>{t('payments.columnStudent')}</Th><Th>{t('payments.columnGroup')}</Th><Th>{t('payments.columnAmount')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="font-semibold">{p.student}</Td>
                    <Td>{p.group || '—'}</Td>
                    <Td>{formatMoney(p.amount)}</Td>
                    <Td><Badge value={p.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-800">{t('dashboard.monthlyPayments')}</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={charts?.payments_by_month ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="expected" name={t('dashboard.expected')} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name={t('dashboard.collected')} fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-800">{t('dashboard.attendanceTrend')}</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={charts?.attendance_trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="absent" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="late" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="px-5 pt-4 font-bold text-slate-800">{t('dashboard.todaysClasses')}</h2>
          {data.todays_classes.length === 0 ? <EmptyState title={t('dashboard.noClassesToday')} /> : (
            <TableShell>
              <thead><tr><Th>{t('groups.columnGroup')}</Th><Th>{t('groupDetails.columnStudents')}</Th><Th>{t('groups.columnTeacher')}</Th><Th>{t('groupDetails.columnRoom')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.todays_classes.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="font-semibold">{c.group}</Td>
                    <Td>{c.start_time}–{c.end_time}</Td>
                    <Td>{c.teacher ?? '—'}</Td>
                    <Td>{c.room || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
        <Card>
          <h2 className="px-5 pt-4 font-bold text-slate-800">{t('dashboard.upcomingPayments')}</h2>
          {data.upcoming_payments.length === 0 ? <EmptyState title={t('dashboard.nothingDueSoon')} /> : (
            <TableShell>
              <thead><tr><Th>{t('payments.columnStudent')}</Th><Th>{t('payments.columnAmount')}</Th><Th>{t('payments.dueDate')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.upcoming_payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td className="font-semibold">{p.student}</Td>
                    <Td>{formatMoney(p.amount)}</Td>
                    <Td>{formatDate(p.due_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-bold text-slate-800">{t('dashboard.quickActions')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/students?new=1')}><UserPlus size={15} /> {t('dashboard.addStudent')}</Button>
          <Button variant="success" onClick={() => navigate('/teachers?new=1')}><BookUser size={15} /> {t('dashboard.addTeacher')}</Button>
          <Button variant="secondary" onClick={() => navigate('/groups?new=1')}><CalendarPlus size={15} /> {t('dashboard.addGroup')}</Button>
          <Button variant="secondary" onClick={() => navigate('/payments?new=1')}><BadgeDollarSign size={15} /> {t('dashboard.addPayment')}</Button>
          <Button variant="secondary" onClick={() => navigate('/attendance')}><ClipboardCheck size={15} /> {t('dashboard.attendanceReport')}</Button>
        </div>
      </Card>
    </>
  )
}

function TeacherDashboard({ data }: { data: TeacherDash }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('dashboard.teacherWelcome', { name: user?.full_name || user?.username })} subtitle={t('dashboard.teacherSubtitle')} />
      <AttendanceTodayCards stats={data.attendance_today} />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold text-slate-800">{t('dashboard.myGroups')}</h2>
            <Link to="/groups"><Button variant="secondary" size="sm">{t('common.viewAll')}</Button></Link>
          </div>
          {data.my_groups.length === 0 ? <EmptyState title={t('dashboard.noGroupsAssigned')} /> : (
            <TableShell>
              <thead><tr><Th>{t('groups.columnGroup')}</Th><Th>{t('groups.columnCourse')}</Th><Th>{t('groups.columnStudents')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.my_groups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/groups/${g.id}`} className="font-semibold text-blue-600 hover:underline">{g.name}</Link>
                    </Td>
                    <Td>{g.course}</Td>
                    <Td>{g.students}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
        <Card>
          <h2 className="px-5 pt-4 font-bold text-slate-800">{t('dashboard.todaysLessons')}</h2>
          {data.todays_lessons.length === 0 ? <EmptyState title={t('dashboard.noLessonsToday')} /> : (
            <TableShell>
              <thead><tr><Th>{t('groups.columnGroup')}</Th><Th>{t('groupDetails.columnStudents')}</Th><Th>{t('groupDetails.columnRoom')}</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.todays_lessons.map((lesson, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="font-semibold">{lesson.group}</Td>
                    <Td>{lesson.start_time}–{lesson.end_time}</Td>
                    <Td>{lesson.room || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="px-5 pt-4 font-bold text-slate-800">{t('dashboard.recentGrades')}</h2>
        {data.recent_grades.length === 0 ? <EmptyState title={t('dashboard.noGradesYet')} /> : (
          <TableShell>
            <thead><tr><Th>{t('grades.columnStudent')}</Th><Th>{t('grades.columnExam')}</Th><Th>{t('grades.columnScore')}</Th><Th>%</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.recent_grades.map((g, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td className="font-semibold">{g.student}</Td>
                  <Td>{g.exam}</Td>
                  <Td>{g.score}</Td>
                  <Td>{g.percentage}%</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-bold text-slate-800">{t('dashboard.quickActions')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/attendance?mark=1')}><ClipboardCheck size={15} /> {t('dashboard.markAttendance')}</Button>
          <Button variant="secondary" onClick={() => navigate('/exams')}>{t('dashboard.addExamResult')}</Button>
        </div>
      </Card>
    </>
  )
}

function StudentCard({ payload, title }: { payload: StudentPayload; title?: string }) {
  const { t } = useTranslation()
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">{title ?? payload.name}</h2>
        <div className="flex gap-1.5">
          {payload.groups.map((g) => (
            <span key={g.id} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {g.name}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t('dashboard.attendanceLabel')}</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-800">
            {payload.attendance.percentage !== null ? `${payload.attendance.percentage}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {payload.attendance.present} {t('common.badge.present').toLowerCase()} · {payload.attendance.absent} {t('common.badge.absent').toLowerCase()} · {payload.attendance.late} {t('common.badge.late').toLowerCase()}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t('dashboard.latestGrades')}</div>
          {payload.recent_grades.length === 0 ? (
            <div className="mt-2 text-sm text-slate-400">{t('dashboard.noGradesYet')}</div>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {payload.recent_grades.slice(0, 3).map((g, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="truncate text-slate-600">{g.exam}</span>
                  <span className="ml-2 font-bold text-slate-800">{g.percentage}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">{t('dashboard.nextPayment')}</div>
          {payload.next_payment ? (
            <>
              <div className="mt-1 text-2xl font-extrabold text-slate-800">
                {formatMoney(payload.next_payment.amount_due)}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                {t('dashboard.due')} {formatDate(payload.next_payment.due_date)} <Badge value={payload.next_payment.status} />
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-emerald-600 font-semibold">{t('dashboard.allPaid')}</div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<Dash>('/dashboard')).data,
  })

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse bg-slate-100">{null}</Card>
        ))}
      </div>
    )
  }

  if (data.role === 'staff') return <StaffDashboard data={data} />
  if (data.role === 'teacher') return <TeacherDashboard data={data} />
  if (data.role === 'student') {
    return (
      <>
        <PageHeader title={t('dashboard.myDashboard')} subtitle={t('dashboard.myDashboardSubtitle')} />
        <StudentCard payload={data.me} title={t('dashboard.myOverview')} />
      </>
    )
  }
  return (
    <>
      <PageHeader title={t('dashboard.myChildren')} subtitle={t('dashboard.myChildrenSubtitle')} />
      <div className="space-y-5">
        {data.children.length === 0 && <Card><EmptyState title={t('dashboard.noChildrenLinked')} /></Card>}
        {data.children.map((c) => <StudentCard key={c.id} payload={c} />)}
      </div>
    </>
  )
}
