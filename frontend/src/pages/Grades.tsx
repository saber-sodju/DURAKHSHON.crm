import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Page, Grade, Student, Tag } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, Select, TableShell, Th, Td, EmptyState, TableSkeleton, Pagination } from '../components/ui'

export default function Grades() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isParent = user?.role === 'parent'
  const [page, setPage] = useState(1)
  const [groupId, setGroupId] = useState('')

  // parents see only their own children here; their groups feed the selector
  const { data: children } = useQuery({
    queryKey: ['students', 'my-children'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
    enabled: isParent,
  })

  const childGroups = useMemo(() => {
    const map = new Map<number, Tag>()
    for (const child of children?.items ?? []) {
      for (const g of child.groups) map.set(g.id, g)
    }
    return [...map.values()]
  }, [children])

  const { data, isLoading } = useQuery({
    queryKey: ['grades', { page, groupId }],
    queryFn: async () => (await api.get<Page<Grade>>('/grades', {
      params: { page, group_id: groupId || undefined },
    })).data,
  })

  return (
    <>
      <PageHeader title={t('grades.title')} subtitle={t('grades.subtitle')} />
      <Card>
        {isParent && childGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
            <Select className="w-full sm:w-64" value={groupId}
                    onChange={(e) => { setGroupId(e.target.value); setPage(1) }}>
              <option value="">{t('grades.scopeMyChildren')}</option>
              {childGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <span className="text-xs text-slate-400">{t('grades.groupViewHint')}</span>
          </div>
        )}
        {isLoading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
          <EmptyState title={t('grades.noGradesYet')} />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>{t('grades.columnStudent')}</Th><Th>{t('grades.columnExam')}</Th><Th>{t('grades.columnGroup')}</Th><Th>{t('grades.columnDate')}</Th>
                  <Th>{t('grades.columnScore')}</Th><Th>%</Th><Th>{t('grades.columnGrade')}</Th><Th>{t('grades.columnComment')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <Td className="font-semibold text-slate-800">{g.student_name}</Td>
                    <Td>{g.exam_title}</Td>
                    <Td>{g.group_name ?? '—'}</Td>
                    <Td>{formatDate(g.exam_date)}</Td>
                    <Td>{g.score}{g.max_score ? ` / ${g.max_score}` : ''}</Td>
                    <Td>{g.percentage}%</Td>
                    <Td><span className="font-bold">{g.grade_label || '—'}</span></Td>
                    <Td className="text-slate-400">{g.comment || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
