import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, UserPlus, ShieldOff } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import type { Page, AppUser, AuditLog, RoleName, Student, Teacher, Parent } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { formatDate } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import {
  Button, Input, Select, Field, Badge, Card, Modal, ConfirmDialog,
  TableShell, Th, Td, EmptyState, TableSkeleton, Pagination,
} from '../components/ui'

interface UserDraft {
  username: string
  email: string
  password: string
  role: RoleName
  full_name: string
  profile_id: string
}

const emptyDraft: UserDraft = {
  username: '', email: '', password: '', role: 'student', full_name: '', profile_id: '',
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const isDirector = me?.role === 'director'

  const [tab, setTab] = useState<'users' | 'audit'>('users')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [deactivating, setDeactivating] = useState<AppUser | null>(null)
  const [draft, setDraft] = useState<UserDraft>(emptyDraft)

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page }],
    queryFn: async () => (await api.get<Page<AppUser>>('/users', { params: { page } })).data,
    enabled: tab === 'users',
  })

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ['audit', { page }],
    queryFn: async () => (await api.get<Page<AuditLog>>('/users/audit-logs', { params: { page } })).data,
    enabled: tab === 'audit',
  })

  // profiles available for linking
  const { data: students } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => (await api.get<Page<Student>>('/students', { params: { page_size: 100 } })).data,
    enabled: modalOpen && draft.role === 'student',
  })
  const { data: teachers } = useQuery({
    queryKey: ['teachers', 'all'],
    queryFn: async () => (await api.get<Page<Teacher>>('/teachers', { params: { page_size: 100 } })).data,
    enabled: modalOpen && draft.role === 'teacher',
  })
  const { data: parents } = useQuery({
    queryKey: ['parents', 'all'],
    queryFn: async () => (await api.get<Page<Parent>>('/parents', { params: { page_size: 100 } })).data,
    enabled: modalOpen && draft.role === 'parent',
  })

  const profileOptions =
    draft.role === 'student' ? (students?.items ?? []).filter((s) => !s.user_id)
    : draft.role === 'teacher' ? (teachers?.items ?? []).filter((t) => !t.user_id)
    : draft.role === 'parent' ? (parents?.items ?? []).filter((p) => !p.user_id)
    : []

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload: Record<string, unknown> = {
          email: draft.email || null, full_name: draft.full_name,
        }
        if (draft.password) payload.password = draft.password
        return (await api.put(`/users/${editing.id}`, payload)).data
      }
      return (await api.post('/users', {
        username: draft.username, email: draft.email || null, password: draft.password,
        role: draft.role, full_name: draft.full_name,
        profile_id: draft.profile_id ? Number(draft.profile_id) : null,
      })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast(editing ? 'User updated' : 'User created')
      setModalOpen(false)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: async (u: AppUser) => (await api.delete(`/users/${u.id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast('User deactivated')
      setDeactivating(null)
    },
    onError: (e) => toast(apiErrorMessage(e), 'error'),
  })

  function openCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setModalOpen(true)
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    setDraft({
      username: u.username, email: u.email ?? '', password: '',
      role: u.role, full_name: u.full_name, profile_id: '',
    })
    setModalOpen(true)
  }

  const valid = editing ? true : draft.username.length >= 3 && draft.password.length >= 8

  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Accounts, roles and audit trail"
                  actions={<Button onClick={openCreate}><UserPlus size={16} /> Add User</Button>} />
      <Card>
        <div className="flex gap-1 border-b border-slate-200 px-4 pt-3">
          {(['users', 'audit'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setPage(1) }}
                    className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'
                    }`}>
              {t === 'users' ? 'Users' : 'Audit Log'}
            </button>
          ))}
        </div>

        {tab === 'users' ? (
          isLoading ? <TableSkeleton cols={6} /> : !data || data.items.length === 0 ? (
            <EmptyState title="No users" />
          ) : (
            <>
              <TableShell>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Username</Th><Th>Full name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Created</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <Td className="font-semibold text-slate-800">{u.username}</Td>
                      <Td>{u.full_name || '—'}</Td>
                      <Td>{u.email ?? '—'}</Td>
                      <Td><Badge value={u.role} /></Td>
                      <Td><Badge value={u.is_active ? 'active' : 'inactive'} /></Td>
                      <Td>{formatDate(u.created_at)}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Edit">
                            <Pencil size={15} className="text-blue-600" />
                          </Button>
                          {isDirector && u.role !== 'director' && u.is_active && (
                            <Button variant="ghost" size="sm" onClick={() => setDeactivating(u)} title="Deactivate">
                              <ShieldOff size={15} className="text-red-500" />
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
            </>
          )
        ) : (
          auditLoading ? <TableSkeleton cols={6} /> : !audit || audit.items.length === 0 ? (
            <EmptyState title="No audit records" />
          ) : (
            <>
              <TableShell>
                <thead className="bg-slate-50">
                  <tr><Th>Time</Th><Th>User</Th><Th>Action</Th><Th>Entity</Th><Th>Detail</Th><Th>IP</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audit.items.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString()}</Td>
                      <Td className="font-semibold">{log.username ?? '—'}</Td>
                      <Td><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold">{log.action}</span></Td>
                      <Td>{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</Td>
                      <Td className="max-w-xs truncate text-slate-500">{log.detail || '—'}</Td>
                      <Td className="text-slate-400">{log.ip_address || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
              <Pagination page={audit.page} pageSize={audit.page_size} total={audit.total} onPage={setPage} />
            </>
          )
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
             title={editing ? `Edit User — ${editing.username}` : 'Add User'}>
        <div className="space-y-4">
          {!editing && (
            <>
              <Field label="Username" required>
                <Input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
              </Field>
              <Field label="Role" required>
                <Select value={draft.role}
                        onChange={(e) => setDraft({ ...draft, role: e.target.value as RoleName, profile_id: '' })}>
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="teacher">Teacher</option>
                  {isDirector && <option value="admin">Admin</option>}
                  {isDirector && <option value="director">Director</option>}
                </Select>
              </Field>
              {['student', 'teacher', 'parent'].includes(draft.role) && (
                <Field label="Link to existing profile">
                  <Select value={draft.profile_id} onChange={(e) => setDraft({ ...draft, profile_id: e.target.value })}>
                    <option value="">— No profile link —</option>
                    {profileOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}
          <Field label="Full name">
            <Input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </Field>
          <Field label={editing ? 'New password (leave blank to keep current)' : 'Password (min 8 chars)'}
                 required={!editing}>
            <Input type="password" value={draft.password}
                   onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button disabled={!valid} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && deactivateMutation.mutate(deactivating)}
        loading={deactivateMutation.isPending}
        title="Deactivate user?"
        message={`${deactivating?.username} will no longer be able to sign in.`}
      />
    </>
  )
}
