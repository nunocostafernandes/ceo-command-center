import { createContext, useContext, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

interface CalendarPrefsContextValue {
  showTasks: boolean
  setShowTasks: Dispatch<SetStateAction<boolean>>
  showReminders: boolean
  setShowReminders: Dispatch<SetStateAction<boolean>>
  selectedCalIds: Set<string> | null
  setSelectedCalIds: Dispatch<SetStateAction<Set<string> | null>>
  selectedMsCalIds: Set<string> | null
  setSelectedMsCalIds: Dispatch<SetStateAction<Set<string> | null>>
}

const CalendarPrefsContext = createContext<CalendarPrefsContextValue | null>(null)

export function CalendarPrefsProvider({ children }: { children: ReactNode }) {
  const [showTasks,      setShowTasks]      = useState(true)
  const [showReminders,  setShowReminders]  = useState(true)
  const [selectedCalIds,   setSelectedCalIds]   = useState<Set<string> | null>(null)
  const [selectedMsCalIds, setSelectedMsCalIds] = useState<Set<string> | null>(null)

  return (
    <CalendarPrefsContext.Provider value={{
      showTasks, setShowTasks,
      showReminders, setShowReminders,
      selectedCalIds, setSelectedCalIds,
      selectedMsCalIds, setSelectedMsCalIds,
    }}>
      {children}
    </CalendarPrefsContext.Provider>
  )
}

export function useCalendarPrefs() {
  const ctx = useContext(CalendarPrefsContext)
  if (!ctx) throw new Error('useCalendarPrefs must be used within CalendarPrefsProvider')
  return ctx
}
