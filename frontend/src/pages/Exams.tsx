import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Plus, GraduationCap } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, Exam, Group, Grade } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Textarea, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

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
      toast('Grades saved')
      onClose()
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  return (
    <Modal open onClose={onClose} title={`Grades — ${exam.title} (max ${exam.max_score})`} wide>
      {!group ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No students in this group" />
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
          {rows.map(({ student, grade }) => (
            <div key={student.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
              <span className="w-40 text-sm font-semibold text-slate-700">
                {student.first_name} {student.last_name}
              </span>
              <Input type="number" min="0" max={exam.max_score} step="0.5" className="w-24"
                     placeholder="Score"
                     value={currentScore(student.id, grade?.score)}
                     onChange={(e) => setScores({ ...scores, [student.id]: { ...(scores[student.id] ?? { comment: grade?.comment ?? '' }), score: e.target.value } })} />
              {grade && (
                <span className="text-xs font-bold text-slate-500">{grade.percentage}% · {grade.grade_label}</span>
              )}
              <Input className="min-w-32 flex-1" placeholder="Comment (optional)"
                     value={scores[student.id]?.comment ?? grade?.comment ?? ''}
                     onChange={(e) => setScores({ ...scores, [student.id]: { ...(scores[student.id] ?? { score: grade?.score ?? '' }), comment: e.target.value } })} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Percentage and letter grade are calculated automatically. Grades become visible to students and
        parents once the exam is published.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save grades</Button>
      </div>
    </Modal>
  )
}

export default function Exams() {
  const { toast } = useToast()
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
      toast(editing ? 'Exam updated' : 'Exam created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (exam: Exam) => (await api.delete(`/exams/${exam.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      toast('Exam deleted')
      setDeleting(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function openEdit(e: Exam) {
    setEditing(e)
    setDraft({
      title: e.title, group_id: String(e.group_id), exam_date: e.exam_date,
      max_score: e.max_score, description: e.description, status: e.status,
    })
    setModalOpen(true)
  }

  const valid = draft.title && draft.group_id && draft.exam_date && Number(draft.max_score) > 0

  return (
    <>
      <PageHeader title="Exams" subtitle="Create exams and enter grades"
                  actions={<Button onClick={openCreate}><Plus size={16} /> Add Exam</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          <Select className="w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
          </Select>
        </div>

        {isLoading ? <TableSkeleton cols={7} /> : !data || data.items.length === 0 ? (
          <EmptyState title="No exams yet" hint="Create your first exam to start grading." />
        ) : (
          <>
            <TableShell>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Title</Th><Th>Group</Th><Th>Teacher</Th><Th>Date</Th>
                  <Th>Max score</Th><Th>Status</Th><Th>Grades</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <Td className="font-semibold text-slate-800">{e.title}</Td>
                    <Td>{e.group_name}</Td>
                    <Td>{e.teacher_name ?? '—'}</Td>
                    <Td>{formatDate(e.exam_date)}</Td>
                    <Td>{e.max_score}</Td>
                    <Td><Badge value={e.status} /></Td>
                    <Td>{e.grades_count}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setGrading(e)} title="Enter grades">
                          <GraduationCap size={16} className="text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(e)} title="Edit">
                          <Pencil size={15} className="text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(e)} title="Delete">
                          <Trash2 size={15} className="text-red-500" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? 'Edit Exam' : 'Add Exam'}>
        <div className="space-y-4">
          <Field label="Title" required>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Group" required>
              <Select value={draft.group_id} onChange={(e) => setDraft({ ...draft, group_id: e.target.value })}>
                <option value="">— Select group —</option>
                {groups?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Exam date" required>
              <Input type="date" value={draft.exam_date} onChange={(e) => setDraft({ ...draft, exam_date: e.target.value })} />
            </Field>
            <Field label="Max score" required>
              <Input type="number" min="1" value={draft.max_score}
                     onChange={(e) => setDraft({ ...draft, max_score: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="draft">Draft (hidden from students)</option>
                <option value="published">Published</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button disabled={!valid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {editing ? 'Save changes' : 'Create exam'}
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
        title="Delete exam?"
        message={`"${deleting?.title}" and all its grades will be permanently removed.`}
      />
    </>
  )
}
