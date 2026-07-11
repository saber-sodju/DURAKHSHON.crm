import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { api } from '../lib/api'
import type { Page, Group } from '../lib/types'
import { formatMoney } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Button, Select, Input, Card, Badge, TableShell, Th, Td, EmptyState, TableSkeleton, MobileCardRow } from '../components/ui'

type Tab = 'attendance' | 'payments' | 'progress' | 'workload'

const TAB_KEYS: { key: Tab; labelKey: string }[] = [
  { key: 'attendance', labelKey: 'reports.tabAttendance' },
  { key: 'payments', labelKey: 'reports.tabPayments' },
  { key: 'progress', labelKey: 'reports.tabProgress' },
  { key: 'workload', labelKey: 'reports.tabWorkload' },
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
  const { t } = useTranslation()
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
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')}
                  actions={canExport && (
                    <Button variant="secondary" onClick={exportCsv}><Download size={15} /> {t('common.exportCsv')}</Button>
                  )} />
      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-4 pt-3">
          {TAB_KEYS.map((tabItem) => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
                    className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === tabItem.key
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
              {t(tabItem.labelKey)}
            </button>
          ))}
        </div>

        {tab !== 'workload' && (
          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
            <Select className="w-full sm:w-44" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">{t('reports.allGroups')}</option>
              {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {tab === 'attendance' && (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Input type="date" className="flex-1 sm:w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="self-center text-slate-400">–</span>
                <Input type="date" className="flex-1 sm:w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          loadingAttendance ? <TableSkeleton cols={7} /> :
          !attendance?.items?.length ? <EmptyState title={t('reports.noDataFilters')} /> : (
            <>
              <div className="hidden lg:block">
                <TableShell>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t('reports.columnStudent')}</Th><Th>{t('reports.columnPresent')}</Th><Th>{t('reports.columnAbsent')}</Th>
                      <Th>{t('reports.columnLate')}</Th><Th>{t('reports.columnExcused')}</Th><Th>{t('reports.columnTotal')}</Th><Th>{t('reports.columnAttendancePct')}</Th>
                    </tr>
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
              </div>
              <div className="space-y-2.5 p-3 lg:hidden">
                {attendance.items.map((r: Record<string, number | string>) => (
                  <MobileCardRow key={r.student_id as number}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-bold text-slate-800">{r.student_name}</span>
                      <span className={`font-bold ${Number(r.attendance_pct) >= 80 ? 'text-emerald-600' : Number(r.attendance_pct) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {r.attendance_pct}%
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="flex justify-between"><dt className="text-slate-500">{t('reports.columnPresent')}</dt><dd className="font-semibold text-slate-700">{r.present}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">{t('reports.columnAbsent')}</dt><dd className="font-semibold text-slate-700">{r.absent}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">{t('reports.columnLate')}</dt><dd className="font-semibold text-slate-700">{r.late}</dd></div>
                      <div className="flex justify-between"><dt className="text-slate-500">{t('reports.columnExcused')}</dt><dd className="font-semibold text-slate-700">{r.excused}</dd></div>
                    </dl>
                  </MobileCardRow>
                ))}
              </div>
            </>
          )
        )}

        {tab === 'payments' && (
          loadingPayments ? <TableSkeleton cols={7} /> : !payments ? null : (
            <>
              <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
                {[
                  [t('reports.totalExpected'), formatMoney(payments.summary.total_amount)],
                  [t('reports.collected'), formatMoney(payments.summary.total_paid)],
                  [t('reports.outstanding'), formatMoney(payments.summary.total_outstanding)],
                  [t('reports.overdueCount'), payments.summary.overdue],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
                    <div className="mt-0.5 text-xl font-extrabold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
              {!payments.items.length ? <EmptyState title={t('reports.noPayments')} /> : (
                <>
                  <div className="hidden lg:block">
                    <TableShell>
                      <thead className="bg-slate-50">
                        <tr>
                          <Th>{t('reports.columnStudent')}</Th><Th>{t('reports.columnGroup')}</Th><Th>{t('reports.columnPeriod')}</Th>
                          <Th>{t('reports.columnAmount')}</Th><Th>{t('reports.columnPaid')}</Th><Th>{t('reports.columnStatus')}</Th>
                        </tr>
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
                  </div>
                  <div className="space-y-2.5 p-3 lg:hidden">
                    {payments.items.map((p: Record<string, string | number>) => (
                      <MobileCardRow key={p.id as number}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-bold text-slate-800">{p.student_name}</span>
                          <Badge value={p.status as string} />
                        </div>
                        <div className="mt-1 text-sm text-slate-500">{p.group_name || '—'} · {String(p.month).padStart(2, '0')}/{p.year}</div>
                        <div className="mt-1.5 flex justify-between text-sm">
                          <span className="text-slate-500">{t('reports.columnAmount')}: <b className="text-slate-700">{formatMoney(p.amount as number)}</b></span>
                          <span className="text-slate-500">{t('reports.columnPaid')}: <b className="text-slate-700">{formatMoney(p.paid_amount as number)}</b></span>
                        </div>
                      </MobileCardRow>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        )}

        {tab === 'progress' && (
          loadingProgress ? <TableSkeleton cols={5} /> :
          !progress?.items?.length ? <EmptyState title={t('reports.noGradesRecorded')} /> : (
            <>
              <div className="hidden lg:block">
                <TableShell>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t('reports.columnStudent')}</Th><Th>{t('reports.columnExamsTaken')}</Th>
                      <Th>{t('reports.columnAveragePct')}</Th><Th>{t('reports.columnBestPct')}</Th><Th>{t('reports.columnWorstPct')}</Th>
                    </tr>
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
              </div>
              <div className="space-y-2.5 p-3 lg:hidden">
                {progress.items.map((r: Record<string, number | string>) => (
                  <MobileCardRow key={r.student_id as number}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-bold text-slate-800">{r.student_name}</span>
                      <span className="font-bold text-slate-700">{r.avg_percentage}%</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                      <div><dt className="text-slate-500">{t('reports.columnExamsTaken')}</dt><dd className="font-bold text-slate-700">{r.exams_taken}</dd></div>
                      <div><dt className="text-slate-500">{t('reports.columnBestPct')}</dt><dd className="font-bold text-emerald-600">{r.best}%</dd></div>
                      <div><dt className="text-slate-500">{t('reports.columnWorstPct')}</dt><dd className="font-bold text-red-600">{r.worst}%</dd></div>
                    </dl>
                  </MobileCardRow>
                ))}
              </div>
            </>
          )
        )}

        {tab === 'workload' && (
          loadingWorkload ? <TableSkeleton cols={5} /> :
          !workload?.items?.length ? <EmptyState title={t('reports.noActiveTeachers')} /> : (
            <>
              <div className="hidden lg:block">
                <TableShell>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t('reports.columnTeacher')}</Th><Th>{t('reports.columnSubject')}</Th><Th>{t('reports.columnGroups')}</Th>
                      <Th>{t('reports.columnStudents')}</Th><Th>{t('reports.columnWeeklyLessons')}</Th>
                    </tr>
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
              </div>
              <div className="space-y-2.5 p-3 lg:hidden">
                {workload.items.map((r: Record<string, number | string>) => (
                  <MobileCardRow key={r.teacher_id as number}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-bold text-slate-800">{r.teacher_name}</span>
                      <span className="text-sm text-slate-500">{r.subject || '—'}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                      <div><dt className="text-slate-500">{t('reports.columnGroups')}</dt><dd className="font-bold text-slate-700">{r.groups}</dd></div>
                      <div><dt className="text-slate-500">{t('reports.columnStudents')}</dt><dd className="font-bold text-slate-700">{r.students}</dd></div>
                      <div><dt className="text-slate-500">{t('reports.columnWeeklyLessons')}</dt><dd className="font-bold text-slate-700">{r.weekly_lessons}</dd></div>
                    </dl>
                  </MobileCardRow>
                ))}
              </div>
            </>
          )
        )}
      </Card>
    </>
  )
}
