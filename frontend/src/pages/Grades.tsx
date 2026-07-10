import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Page, Grade, Student, Tag } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, Select, TableSkeleton, Pagination } from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'

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
        {isLoading ? <TableSkeleton cols={6} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(g) => g.id}
              emptyTitle={t('grades.noGradesYet')}
              columns={[
                { key: 'student', header: t('grades.columnStudent'), primary: true, cell: (g) => g.student_name },
                { key: 'exam', header: t('grades.columnExam'), cell: (g) => g.exam_title },
                { key: 'group', header: t('grades.columnGroup'), cell: (g) => g.group_name ?? '—' },
                { key: 'date', header: t('grades.columnDate'), cell: (g) => formatDate(g.exam_date) },
                { key: 'score', header: t('grades.columnScore'),
                  cell: (g) => `${g.score}${g.max_score ? ` / ${g.max_score}` : ''}` },
                { key: 'pct', header: '%', cell: (g) => `${g.percentage}%` },
                { key: 'grade', header: t('grades.columnGrade'),
                  cell: (g) => <span className="font-bold">{g.grade_label || '—'}</span> },
                { key: 'comment', header: t('grades.columnComment'), cell: (g) => g.comment || '—' },
              ]}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
