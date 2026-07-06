import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import type { Page, Group } from '../lib/types'
import { formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Button, Select, Input, Card, Badge, TableShell, Th, Td, EmptyState, TableSkeleton } from '../components/ui'

type Tab = 'attendance' | 'payments' | 'progress' | 'workload'

const TABS: { key: Tab; label: string }[] = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'payments', label: 'Payments' },
  { key: 'progress', label: 'Student Progress' },
  { key: 'workload', label: 'Teacher Workload' },
]

async function downloadCsv(path: string, params: Record<string, string | undefined>, filename: string) {
  const res = await api.get(path, { params: { ...params, export: 'csv' }, responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('attendance')
  const [groupId, setGroupId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
  })

  const attendanceParams = {
    group_id: groupId || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
  }
  const { data: attendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['reports', 'attendance', attendanceParams],
    queryFn: async () => (await api.get('/reports/attendance', { params: attendanceParams })).data,
    enabled: tab === 'attendance',
  })

  const paymentParams = { group_id: groupId || undefined }
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['reports', 'payments', paymentParams],
    queryFn: async () => (await api.get('/reports/payments', { params: paymentParams })).data,
    enabled: tab === 'payments',
  })

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ['reports', 'progress', { groupId }],
    queryFn: async () => (await api.get('/reports/student-progress', {
      params: { group_id: groupId || undefined },
    })).data,
    enabled: tab === 'progress',
  })

  const { data: workload, isLoading: loadingWorkload } = useQuery({
    queryKey: ['reports', 'workload'],
    queryFn: async () => (await api.get('/reports/teacher-workload')).data,
    enabled: tab === 'workload',
  })

  const canExport = tab === 'attendance' || tab === 'payments' || tab === 'progress'

  function exportCsv() {
    if (tab === 'attendance') downloadCsv('/reports/attendance', attendanceParams, 'attendance_report.csv')
    if (tab === 'payments') downloadCsv('/reports/payments', paymentParams, 'payments_report.csv')
    if (tab === 'progress') downloadCsv('/reports/student-progress', { group_id: groupId || undefined }, 'student_progress.csv')
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Analytics and exports"
                  actions={canExport && (
                    <Button variant="secondary" onClick={exportCsv}><Download size={15} /> Export CSV</Button>
                  )} />
      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 pt-3">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === t.key
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'workload' && (
          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
            <Select className="w-44" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">All Groups</option>
              {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {tab === 'attendance' && (
              <>
                <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="self-center text-slate-400">–</span>
                <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          loadingAttendance ? <TableSkeleton cols={7} /> :
          !attendance?.items?.length ? <EmptyState title="No data for these filters" /> : (
            <TableShell>
              <thead className="bg-slate-50">
                <tr><Th>Student</Th><Th>Present</Th><Th>Absent</Th><Th>Late</Th><Th>Excused</Th><Th>Total</Th><Th>Attendance %</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.items.map((r: Record<string, number | string>) => (
                  <tr key={r.student_id as number} className="hover:bg-slate-50">
                    <Td className="font-semibold">{r.student_name}</Td>
                    <Td>{r.present}</Td><Td>{r.absent}</Td><Td>{r.late}</Td><Td>{r.excused}</Td><Td>{r.total}</Td>
                    <Td>
                      <span className={`font-bold ${Number(r.attendance_pct) >= 80 ? 'text-emerald-600' : Number(r.attendance_pct) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {r.attendance_pct}%
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )
        )}

        {tab === 'payments' && (
          loadingPayments ? <TableSkeleton cols={7} /> : !payments ? null : (
            <>
              <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
                {[
                  ['Total expected', formatMoney(payments.summary.total_amount)],
                  ['Collected', formatMoney(payments.summary.total_paid)],
                  ['Outstanding', formatMoney(payments.summary.total_outstanding)],
                  ['Overdue count', payments.summary.overdue],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
                    <div className="mt-0.5 text-xl font-extrabold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
              {!payments.items.length ? <EmptyState title="No payments" /> : (
                <TableShell>
                  <thead className="bg-slate-50">
                    <tr><Th>Student</Th><Th>Group</Th><Th>Period</Th><Th>Amount</Th><Th>Paid</Th><Th>Status</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.items.map((p: Record<string, string | number>) => (
                      <tr key={p.id as number} className="hover:bg-slate-50">
                        <Td className="font-semibold">{p.student_name}</Td>
                        <Td>{p.group_name || '—'}</Td>
                        <Td>{String(p.month).padStart(2, '0')}/{p.year}</Td>
                        <Td>{formatMoney(p.amount as number)}</Td>
                        <Td>{formatMoney(p.paid_amount as number)}</Td>
                        <Td><Badge value={p.status as string} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </>
          )
        )}

        {tab === 'progress' && (
          loadingProgress ? <TableSkeleton cols={5} /> :
          !progress?.items?.length ? <EmptyState title="No grades recorded yet" /> : (
            <TableShell>
              <thead className="bg-slate-50">
                <tr><Th>Student</Th><Th>Exams taken</Th><Th>Average %</Th><Th>Best %</Th><Th>Worst %</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {progress.items.map((r: Record<string, number | string>) => (
                  <tr key={r.student_id as number} className="hover:bg-slate-50">
                    <Td className="font-semibold">{r.student_name}</Td>
                    <Td>{r.exams_taken}</Td>
                    <Td className="font-bold">{r.avg_percentage}%</Td>
                    <Td className="text-emerald-600">{r.best}%</Td>
                    <Td className="text-red-600">{r.worst}%</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )
        )}

        {tab === 'workload' && (
          loadingWorkload ? <TableSkeleton cols={5} /> :
          !workload?.items?.length ? <EmptyState title="No active teachers" /> : (
            <TableShell>
              <thead className="bg-slate-50">
                <tr><Th>Teacher</Th><Th>Subject</Th><Th>Groups</Th><Th>Students</Th><Th>Weekly lessons</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workload.items.map((r: Record<string, number | string>) => (
                  <tr key={r.teacher_id as number} className="hover:bg-slate-50">
                    <Td className="font-semibold">{r.teacher_name}</Td>
                    <Td>{r.subject || '—'}</Td>
                    <Td>{r.groups}</Td>
                    <Td>{r.students}</Td>
                    <Td>{r.weekly_lessons}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )
        )}
      </Card>
    </>
  )
}
