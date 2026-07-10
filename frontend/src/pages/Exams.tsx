import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Plus, GraduationCap } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Exam, Group, Grade } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  EmptyState, TableSkeleton, Pagination,
} from '../components/ui'
import { ResponsiveTable } from '../components/ResponsiveTable'

interface ExamDraft {
  title: string
  group_id: string
  exam_date: string
  max_score: string
  description: string
  status: string
}

const emptyDraft: ExamDraft = {
  title: '', group_id: '', exam_date: new Date().toISOString().slice(0, 10),
  max_score: '100', description: '', status: 'draft',
}

function GradesModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [scores, setScores] = useState<Record<number, { score: string; comment: string }>>({})

  const { data: group } = useQuery({
    queryKey: ['groups', exam.group_id],
    queryFn: async () => (await api.get<Group>(`/groups/${exam.group_id}`)).data,
  })
  const { data: existing } = useQuery({
    queryKey: ['grades', { exam: exam.id }],
    queryFn: async () => (await api.get<Page<Grade>>('/grades', {
      params: { exam_id: exam.id, page_size: 200 },
    })).data,
  })

  const rows = useMemo(() => {
    if (!group) return []
    return group.students.map((s) => {
      const grade = existing?.items.find((g) => g.student_id === s.id)
      return { student: s, grade }
    })
  }, [group, existing])

  function currentScore(studentId: number, fallback?: string) {
    return scores[studentId]?.score ?? fallback ?? ''
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = rows
        .map(({ student, grade }) => {
          const score = currentScore(student.id, grade?.score)
          if (score === '') return null
          return {
            student_id: student.id,
            score,
            comment: scores[student.id]?.comment ?? grade?.comment ?? '',
          }
        })
        .filter(Boolean)
      return (await api.post('/grades', { exam_id: exam.id, items })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grades'] })
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      toast(t('toasts.gradesSaved'))
      onClose()
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  return (
    <Modal open onClose={onClose} title={t('exams.gradesModalTitle', { title: exam.title, max: exam.max_score })} wide>
      {!group ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title={t('exams.noStudentsInGroup')} />
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          {rows.map(({ student, grade }) => (
            <div key={student.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
              <span className="w-40 text-sm font-semibold text-slate-700">
                {student.first_name} {student.last_name}
              </span>
              <Input type="number" min="0" max={exam.max_score} step="0.5" className="w-24"
                     placeholder={t('exams.scorePlaceholder')}
                     value={currentScore(student.id, grade?.score)}
                     onChange={(e) => setScores({ ...scores, [student.id]: { ...(scores[student.id] ?? { comment: grade?.comment ?? '' }), score: e.target.value } })} />
              {grade && (
                <span className="text-xs font-bold text-slate-500">{grade.percentage}% · {grade.grade_label}</span>
              )}
              <Input className="min-w-32 flex-1" placeholder={t('exams.commentPlaceholder')}
                     value={scores[student.id]?.comment ?? grade?.comment ?? ''}
                     onChange={(e) => setScores({ ...scores, [student.id]: { ...(scores[student.id] ?? { score: grade?.score ?? '' }), comment: e.target.value } })} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        {t('exams.gradesHint')}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{t('exams.saveGrades')}</Button>
      </div>
    </Modal>
  )
}

export default function Exams() {
  const { toast } = useToast()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [deleting, setDeleting] = useState<Exam | null>(null)
  const [grading, setGrading] = useState<Exam | null>(null)
  const [draft, setDraft] = useState<ExamDraft>(emptyDraft)

  const { data, isLoading } = useQuery({
    queryKey: ['exams', { statusFilter, page }],
    queryFn: async () => (await api.get<Page<Exam>>('/exams', {
      params: { status: statusFilter || undefined, page },
    })).data,
  })

  const { data: groups } = useQuery({
    queryKey: ['groups', 'all'],
    queryFn: async () => (await api.get<Page<Group>>('/groups', { params: { page_size: 100 } })).data,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: draft.title, group_id: Number(draft.group_id), exam_date: draft.exam_date,
        max_score: draft.max_score, description: draft.description, status: draft.status,
      }
      if (editing) return (await api.put(`/exams/${editing.id}`, payload)).data
      return (await api.post('/exams', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      toast(editing ? t('toasts.examUpdated') : t('toasts.examCreated'))
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (exam: Exam) => (await api.delete(`/exams/${exam.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      toast(t('toasts.examDeleted'))
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function openEdit(exam: Exam) {
    setEditing(exam)
    setDraft({
      title: exam.title, group_id: String(exam.group_id), exam_date: exam.exam_date,
      max_score: exam.max_score, description: exam.description, status: exam.status,
    })
    setModalOpen(true)
  }

  const valid = draft.title && draft.group_id && draft.exam_date && Number(draft.max_score) > 0

  return (
    <>
      <PageHeader title={t('exams.title')} subtitle={t('exams.subtitle')}
                  actions={<Button onClick={openCreate}><Plus size={16} /> {t('exams.addExam')}</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          <Select className="w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('exams.allStatuses')}</option>
            <option value="draft">{t('exams.statusDraft')}</option>
            <option value="published">{t('exams.statusPublished')}</option>
            <option value="completed">{t('exams.statusCompleted')}</option>
          </Select>
        </div>

        {isLoading ? <TableSkeleton cols={7} /> : !data ? null : (
          <>
            <ResponsiveTable
              rows={data.items}
              rowKey={(exam) => exam.id}
              emptyTitle={t('exams.noExamsYet')}
              emptyHint={t('exams.noExamsHint')}
              columns={[
                { key: 'title', header: t('exams.columnTitle'), primary: true, cell: (exam) => exam.title },
                { key: 'group', header: t('exams.columnGroup'), cell: (exam) => exam.group_name },
                { key: 'teacher', header: t('exams.columnTeacher'), cell: (exam) => exam.teacher_name ?? '—' },
                { key: 'date', header: t('exams.columnDate'), cell: (exam) => formatDate(exam.exam_date) },
                { key: 'max', header: t('exams.columnMaxScore'), cell: (exam) => exam.max_score },
                { key: 'status', header: t('exams.columnStatus'), cell: (exam) => <Badge value={exam.status} /> },
                { key: 'grades', header: t('exams.columnGrades'), cell: (exam) => exam.grades_count },
                { key: 'actions', header: t('common.actions'), actions: true,
                  cell: (exam) => (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setGrading(exam)} title={t('exams.enterGrades')}>
                        <GraduationCap size={16} className="text-emerald-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(exam)} title={t('common.edit')}>
                        <Pencil size={15} className="text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(exam)} title={t('common.delete')}>
                        <Trash2 size={15} className="text-red-500" />
                      </Button>
                    </>
                  ) },
              ]}
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? t('exams.editExam') : t('exams.addExamTitle')}>
        <div className="space-y-4">
          <Field label={t('exams.examTitle')} required>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('exams.group')} required>
              <Select value={draft.group_id} onChange={(e) => setDraft({ ...draft, group_id: e.target.value })}>
                <option value="">{t('exams.selectGroup')}</option>
                {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label={t('exams.examDate')} required>
              <Input type="date" value={draft.exam_date} onChange={(e) => setDraft({ ...draft, exam_date: e.target.value })} />
            </Field>
            <Field label={t('exams.maxScore')} required>
              <Input type="number" min="1" value={draft.max_score}
                     onChange={(e) => setDraft({ ...draft, max_score: e.target.value })} />
            </Field>
            <Field label={t('exams.status')}>
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="draft">{t('exams.statusDraftHint')}</option>
                <option value="published">{t('exams.statusPublished')}</option>
                <option value="completed">{t('exams.statusCompleted')}</option>
              </Select>
            </Field>
          </div>
          <Field label={t('exams.description')}>
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!valid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {editing ? t('common.saveChanges') : t('exams.createExam')}
            </Button>
          </div>
        </div>
      </Modal>

      {grading && <GradesModal exam={grading} onClose={() => setGrading(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
        title={t('confirm.deleteExamTitle')}
        message={t('confirm.deleteExamMessage', { title: deleting?.title })}
      />
    </>
  )
}
