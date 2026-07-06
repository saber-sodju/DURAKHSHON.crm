import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
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
  const cards = [
    { key: 'present', label: 'Today — Present', color: 'border-emerald-500 text-emerald-600' },
    { key: 'absent', label: 'Today — Absent', color: 'border-red-500 text-red-600' },
    { key: 'late', label: 'Today — Late', color: 'border-amber-500 text-amber-600' },
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
  const { data: charts } = useQuery({
    queryKey: ['reports', 'charts'],
    queryFn: async () => (await api.get<Charts>('/reports/charts')).data,
  })
  const paid = data.payments_this_month.paid ?? 0
  const unpaidTotal = (data.payments_this_month.unpaid ?? 0) + (data.payments_this_month.overdue ?? 0)

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.full_name || user?.username}!`}
        subtitle="Here's what's happening at the learning center today."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users size={22} className="text-blue-600" />} accent="bg-blue-50"
                  value={data.active_students} label="Active Students" />
        <StatCard icon={<BookUser size={22} className="text-emerald-600" />} accent="bg-emerald-50"
                  value={data.active_teachers} label="Active Teachers" />
        <StatCard icon={<Boxes size={22} className="text-cyan-600" />} accent="bg-cyan-50"
                  value={data.active_groups} label="Active Groups" />
        <StatCard icon={<Wallet size={22} className="text-amber-600" />} accent="bg-amber-50"
                  value={`${paid} / ${unpaidTotal}`} label="Paid / Unpaid (this month)" />
      </div>

      <div className="mt-6">
        <AttendanceTodayCards stats={data.attendance_today} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold text-slate-800">Recent Students</h2>
            <Link to="/students"><Button variant="secondary" size="sm">View All</Button></Link>
          </div>
          {data.recent_students.length === 0 ? <EmptyState title="No students yet" /> : (
            <TableShell>
              <thead><tr><Th>Name</Th><Th>Parent</Th><Th>Status</Th></tr></thead>
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
            <h2 className="font-bold text-slate-800">Recent Payments</h2>
            <Link to="/payments"><Button variant="secondary" size="sm">View All</Button></Link>
          </div>
          {data.recent_payments.length === 0 ? <EmptyState title="No payments yet" /> : (
            <TableShell>
              <thead><tr><Th>Student</Th><Th>Group</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
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
          <h2 className="mb-4 font-bold text-slate-800">Monthly Payments</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={charts?.payments_by_month ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="expected" name="Expected" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-bold text-slate-800">Attendance Trend (14 days)</h2>
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
          <h2 className="px-5 pt-4 font-bold text-slate-800">Today's Classes</h2>
          {data.todays_classes.length === 0 ? <EmptyState title="No classes today" /> : (
            <TableShell>
              <thead><tr><Th>Group</Th><Th>Time</Th><Th>Teacher</Th><Th>Room</Th></tr></thead>
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
          <h2 className="px-5 pt-4 font-bold text-slate-800">Upcoming Payments</h2>
          {data.upcoming_payments.length === 0 ? <EmptyState title="Nothing due soon" /> : (
            <TableShell>
              <thead><tr><Th>Student</Th><Th>Amount Due</Th><Th>Due Date</Th></tr></thead>
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
        <h2 className="mb-3 font-bold text-slate-800">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/students?new=1')}><UserPlus size={15} /> Add Student</Button>
          <Button variant="success" onClick={() => navigate('/teachers?new=1')}><BookUser size={15} /> Add Teacher</Button>
          <Button variant="secondary" onClick={() => navigate('/groups?new=1')}><CalendarPlus size={15} /> Add Group</Button>
          <Button variant="secondary" onClick={() => navigate('/payments?new=1')}><BadgeDollarSign size={15} /> Add Payment</Button>
          <Button variant="secondary" onClick={() => navigate('/attendance')}><ClipboardCheck size={15} /> Attendance Report</Button>
        </div>
      </Card>
    </>
  )
}

function TeacherDashboard({ data }: { data: TeacherDash }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  return (
    <>
      <PageHeader title={`Welcome, ${user?.full_name || user?.username}!`} subtitle="Your teaching overview for today." />
      <AttendanceTodayCards stats={data.attendance_today} />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-bold text-slate-800">My Groups</h2>
            <Link to="/groups"><Button variant="secondary" size="sm">View All</Button></Link>
          </div>
          {data.my_groups.length === 0 ? <EmptyState title="No groups assigned" /> : (
            <TableShell>
              <thead><tr><Th>Group</Th><Th>Course</Th><Th>Students</Th></tr></thead>
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
          <h2 className="px-5 pt-4 font-bold text-slate-800">Today's Lessons</h2>
          {data.todays_lessons.length === 0 ? <EmptyState title="No lessons today" /> : (
            <TableShell>
              <thead><tr><Th>Group</Th><Th>Time</Th><Th>Room</Th></tr></thead>
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
        <h2 className="px-5 pt-4 font-bold text-slate-800">Recent Grades</h2>
        {data.recent_grades.length === 0 ? <EmptyState title="No grades yet" /> : (
          <TableShell>
            <thead><tr><Th>Student</Th><Th>Exam</Th><Th>Score</Th><Th>%</Th></tr></thead>
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
        <h2 className="mb-3 font-bold text-slate-800">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/attendance?mark=1')}><ClipboardCheck size={15} /> Mark Attendance</Button>
          <Button variant="secondary" onClick={() => navigate('/exams')}>Add Exam Result</Button>
        </div>
      </Card>
    </>
  )
}

function StudentCard({ payload, title }: { payload: StudentPayload; title?: string }) {
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
          <div className="text-xs font-semibold uppercase text-slate-500">Attendance</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-800">
            {payload.attendance.percentage !== null ? `${payload.attendance.percentage}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {payload.attendance.present} present · {payload.attendance.absent} absent · {payload.attendance.late} late
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Latest Grades</div>
          {payload.recent_grades.length === 0 ? (
            <div className="mt-2 text-sm text-slate-400">No grades yet</div>
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
          <div className="text-xs font-semibold uppercase text-slate-500">Next Payment</div>
          {payload.next_payment ? (
            <>
              <div className="mt-1 text-2xl font-extrabold text-slate-800">
                {formatMoney(payload.next_payment.amount_due)}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                due {formatDate(payload.next_payment.due_date)} <Badge value={payload.next_payment.status} />
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-emerald-600 font-semibold">All paid ✓</div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
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
        <PageHeader title="My Dashboard" subtitle="Your progress at a glance." />
        <StudentCard payload={data.me} title="My Overview" />
      </>
    )
  }
  return (
    <>
      <PageHeader title="My Children" subtitle="Progress of each of your children." />
      <div className="space-y-5">
        {data.children.length === 0 && <Card><EmptyState title="No children linked to your account" /></Card>}
        {data.children.map((c) => <StudentCard key={c.id} payload={c} />)}
      </div>
    </>
  )
}
