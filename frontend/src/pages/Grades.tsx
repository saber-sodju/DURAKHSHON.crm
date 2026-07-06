import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import type { Page, Grade } from '../lib/types'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import { Card, TableShell, Th, Td, EmptyState, TableSkeleton, Pagination } from '../components/ui'

export default function Grades() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['grades', { page }],
    queryFn: async () => (await api.get<Page<Grade>>('/grades', { params: { page } })).data,
  })

  return (
    <>
      <PageHeader title={t('grades.title')} subtitle={t('grades.subtitle')} />
      <Card>
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
