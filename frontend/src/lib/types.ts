export type RoleName = 'director' | 'admin' | 'teacher' | 'student' | 'parent'

export interface Me {
  id: number
  username: string
  email: string | null
  role: RoleName
  full_name: string
  is_active: boolean
  profile_id: number | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface Tag {
  id: number
  name?: string
  first_name?: string
  last_name?: string
}

export interface Student {
  id: number
  user_id: number | null
  first_name: string
  last_name: string
  phone: string
  email: string
  date_of_birth: string | null
  gender: string
  status: string
  enrollment_date: string | null
  notes: string
  created_at: string
  parents: Tag[]
  groups: Tag[]
}

export interface Teacher {
  id: number
  user_id: number | null
  first_name: string
  last_name: string
  phone: string
  email: string
  subject: string
  status: string
  salary: string | null
  notes: string
  created_at: string
  groups: Tag[]
}

export interface Parent {
  id: number
  user_id: number | null
  first_name: string
  last_name: string
  phone: string
  email: string
  status: string
  notes: string
  created_at: string
  children: Tag[]
}

export interface ScheduleSlot {
  id: number
  group_id: number
  day_of_week: number
  start_time: string
  end_time: string
  room: string
  group_name?: string | null
  teacher_name?: string | null
}

export interface Group {
  id: number
  name: string
  course_name: string
  teacher_id: number | null
  price_per_month: string
  status: string
  start_date: string | null
  end_date: string | null
  room: string
  created_at: string
  teacher: Tag | null
  students: Tag[]
  schedules: ScheduleSlot[]
}

export interface AttendanceRecord {
  id: number
  student_id: number
  group_id: number
  teacher_id: number | null
  date: string
  status: string
  note: string
  student_name?: string | null
  group_name?: string | null
  teacher_name?: string | null
}

export interface Payment {
  id: number
  student_id: number
  group_id: number | null
  month: number
  year: number
  amount: string
  paid_amount: string
  status: string
  due_date: string | null
  paid_date: string | null
  method: string
  note: string
  created_at: string
  student_name?: string | null
  group_name?: string | null
}

export interface Exam {
  id: number
  title: string
  group_id: number
  teacher_id: number | null
  exam_date: string
  max_score: string
  description: string
  status: string
  created_at: string
  group_name?: string | null
  teacher_name?: string | null
  grades_count: number
}

export interface Grade {
  id: number
  exam_id: number
  student_id: number
  score: string
  percentage: string
  grade_label: string
  comment: string
  created_at: string
  student_name?: string | null
  exam_title?: string | null
  exam_date?: string | null
  max_score?: string | null
  group_name?: string | null
}

export interface AppUser {
  id: number
  username: string
  email: string | null
  role: RoleName
  full_name: string
  is_active: boolean
  created_at: string
}

export interface AuditLog {
  id: number
  user_id: number | null
  action: string
  entity: string
  entity_id: number | null
  detail: string
  ip_address: string
  created_at: string
  username: string | null
}

export interface Notification {
  id: number
  title: string
  body: string
  kind: string
  is_read: boolean
  created_at: string
}

export function personName(tag: Tag | null | undefined): string {
  if (!tag) return '—'
  return tag.name ?? `${tag.first_name ?? ''} ${tag.last_name ?? ''}`.trim()
}
