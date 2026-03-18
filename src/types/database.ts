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
  due_date: string | null        // "YYYY-MM-DD" text
  due_time: string | null        // "HH:MM" or null
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  project_id: string | null
  milestone_id: string | null
  assigned_to: string | null
  tags: string[]                 // always an array, default []
  series_id: string | null       // uuid or null
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

export interface TaskSeries {
  id: string
  user_id: string
  recurrence_type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurrence_interval: number    // positive integer, e.g. 1 = every 1 week
  base_title: string
  base_priority: 'urgent' | 'high' | 'medium' | 'low' | null
  base_list_name: string         // NOT NULL DEFAULT 'Inbox' in DB
  base_description: string | null
  base_due_time: string | null   // "HH:MM" or null
  base_tags: string[]
  start_date: string             // "YYYY-MM-DD"
  created_at: string
  // No updated_at — series are immutable (edit series is out of scope for v2)
}
