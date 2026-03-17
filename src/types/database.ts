export interface Note {
  id: string
  user_id: string
  title: string
  content: string | null
  tags: string[] | null
  is_pinned: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  list_name: string | null
  title: string
  description: string | null
  priority: 'urgent' | 'high' | 'medium' | 'low' | null
  due_date: string | null
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  project_id: string | null
  milestone_id: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export interface Reminder {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
  recurrence: string | null
  is_dismissed: boolean
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  description: string | null
  status: 'planning' | 'active' | 'on_hold' | 'completed'
  priority: 'urgent' | 'high' | 'medium' | 'low' | null
  color: string | null
  icon: string | null
  due_date: string | null
  started_at: string | null
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  user_id: string
  project_id: string
  title: string
  description: string | null
  due_date: string | null
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
}
