import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { Student, Page, AttendanceRecord, Payment, Grade } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { formatDate, formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, Badge, TableShell, Th, Td, EmptyState, TableSkeleton, Button } from '../components/ui'

export default function StudentDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const canSeePayments = user?.role !== 'teacher'

  const { data: student, isLoading } = useQuery({
    queryKey: ['students', id],
    queryFn: async () => (await api.get<Student>(`/students/${id}`)).data,
  })
  const { data: attendance } = useQuery({
    queryKey: ['attendance', { student: id }],
    queryFn: async () => (await api.get<Page<AttendanceRecord>>('/attendance', {
      params: { student_id: id, page_size: 10 },
    })).data,
  })
  const { data: payments } = useQuery({
    queryKey: ['payments', { student: id }],
    queryFn: async () => (await api.get<Page<Payment>>('/payments', {
      params: { student_id: id, page_size: 10 },
    })).data,
    enabled: canSeePayments,
  })
  const { data: grades } = useQuery({
    queryKey: ['grades', { student: id }],
    queryFn: async () => (await api.get<Page<Grade>>('/grades', {
      params: { student_id: id, page_size: 10 },
    })).data,
  })

  if (isLoading || !student) return <Card><TableSkeleton /></Card>

  return (
    <>
      <Link to="/students" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
        <ArrowLeft size={15} /> Back to students
      </Link>
      <PageHeader
        title={`${student.first_name} ${student.last_name}`}
        subtitle={`Student profile · enrolled ${formatDate(student.enrollment_date)}`}
        actions={<Badge value={student.status} className="text-sm" />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-800">Details</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              ['Phone', student.phone || '—'],
              ['Email', student.email || '—'],
              ['Date of birth', formatDate(student.date_of_birth)],
              ['Gender', student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : '—'],
              ['Notes', student.notes || '—'],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-4">
                <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
                <dd className="text-right text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Parents</h3>
          {student.parents.length === 0 ? <p className="text-sm text-slate-400">No parents linked</p> : (
            <div className="flex flex-wrap gap-1.5">
              {student.parents.map((p) => (
                <span key={p.id} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  {p.first_name} {p.last_name}
                </span>
              ))}
            </div>
          )}
          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Groups</h3>
          {student.groups.length === 0 ? <p className="text-sm text-slate-400">Not in any group</p> : (
            <div className="flex flex-wrap gap-1.5">
              {student.groups.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`}
                      className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                  {g.name}
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="font-bold text-slate-800">Recent Attendance</h2>
              <Link to={`/attendance?student_id=${student.id}`}><Button variant="secondary" size="sm">View all</Button></Link>
            </div>
            {!attendance || attendance.items.length === 0 ? <EmptyState title="No attendance records" /> : (
              <TableShell>
                <thead><tr><Th>Date</Th><Th>Group</Th><Th>Status</Th><Th>Note</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td>{formatDate(r.date)}</Td>
                      <Td>{r.group_name}</Td>
                      <Td><Badge value={r.status} /></Td>
                      <Td className="text-slate-400">{r.note || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>

          <Card>
            <h2 className="px-5 pt-4 font-bold text-slate-800">Exam Results</h2>
            {!grades || grades.items.length === 0 ? <EmptyState title="No grades yet" /> : (
              <TableShell>
                <thead><tr><Th>Exam</Th><Th>Group</Th><Th>Score</Th><Th>%</Th><Th>Grade</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {grades.items.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <Td className="font-semibold">{g.exam_title}</Td>
                      <Td>{g.group_name}</Td>
                      <Td>{g.score}{g.max_score ? ` / ${g.max_score}` : ''}</Td>
                      <Td>{g.percentage}%</Td>
                      <Td><span className="font-bold text-slate-800">{g.grade_label || '—'}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Card>

          {canSeePayments && (
            <Card>
              <h2 className="px-5 pt-4 font-bold text-slate-800">Payments</h2>
              {!payments || payments.items.length === 0 ? <EmptyState title="No payments" /> : (
                <TableShell>
                  <thead><tr><Th>Period</Th><Th>Group</Th><Th>Amount</Th><Th>Paid</Th><Th>Status</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.items.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <Td>{p.month.toString().padStart(2, '0')}/{p.year}</Td>
                        <Td>{p.group_name ?? '—'}</Td>
                        <Td>{formatMoney(p.amount)}</Td>
                        <Td>{formatMoney(p.paid_amount)}</Td>
                        <Td><Badge value={p.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
