import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { NotesPage } from '@/pages/NotesPage'
import { TasksPage } from '@/pages/TasksPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { RemindersPage } from '@/pages/RemindersPage'
import { SettingsPage } from '@/pages/SettingsPage'

function NotFoundPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
      <p className="text-6xl font-bold text-text-tertiary">404</p>
      <p className="text-text-secondary">Page not found</p>
      <a href="/dashboard" className="text-accent hover:underline text-sm">Go home</a>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
