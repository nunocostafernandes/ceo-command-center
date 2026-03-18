import { useState, useCallback } from 'react'
import { useGoogleLogin, googleLogout } from '@react-oauth/google'

export interface GCalEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
  htmlLink?: string
  allDay?: boolean
}

interface StoredToken {
  access_token: string
  expires_at: number
}

const STORAGE_KEY = 'gcal_token'
const API = 'https://www.googleapis.com/calendar/v3'

function loadToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const t: StoredToken = JSON.parse(raw)
    if (Date.now() >= t.expires_at) { localStorage.removeItem(STORAGE_KEY); return null }
    return t.access_token
  } catch { return null }
}

export function useGoogleCalendar() {
  const [token, setToken] = useState<string | null>(loadToken)
  const isConnected = !!token

  const connect = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar',
    onSuccess: res => {
      const stored: StoredToken = {
        access_token: res.access_token,
        expires_at: Date.now() + ((res.expires_in ?? 3600) - 60) * 1000,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      setToken(res.access_token)
    },
    onError: err => console.error('Google login failed', err),
  })

  const disconnect = useCallback(() => {
    googleLogout()
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }, [])

  // Re-reads token from state, but we use the closure ref to avoid stale token
  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token],
  )

  const fetchEvents = useCallback(async (timeMin: string, timeMax: string): Promise<GCalEvent[]> => {
    if (!token) return []
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
    const res = await fetch(`${API}/calendars/primary/events?${params}`, { headers: authHeader() })
    if (res.status === 401) { disconnect(); return [] }
    if (!res.ok) return []
    const data = await res.json() as { items?: GCalEvent[] }
    return (data.items ?? []).map(e => ({ ...e, allDay: !!e.start.date && !e.start.dateTime }))
  }, [token, authHeader, disconnect])

  const createEvent = useCallback(async (
    summary: string,
    start: string,   // ISO datetime or date
    end: string,
    description?: string,
    allDay?: boolean,
  ): Promise<GCalEvent | null> => {
    if (!token) return null
    const body = allDay
      ? { summary, description, start: { date: start.slice(0, 10) }, end: { date: end.slice(0, 10) } }
      : { summary, description, start: { dateTime: start }, end: { dateTime: end } }
    const res = await fetch(`${API}/calendars/primary/events`, {
      method: 'POST', headers: authHeader(), body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return res.json() as Promise<GCalEvent>
  }, [token, authHeader])

  const updateEvent = useCallback(async (
    id: string,
    summary: string,
    start: string,
    end: string,
    description?: string,
    allDay?: boolean,
  ): Promise<GCalEvent | null> => {
    if (!token) return null
    const body = allDay
      ? { summary, description, start: { date: start.slice(0, 10) }, end: { date: end.slice(0, 10) } }
      : { summary, description, start: { dateTime: start }, end: { dateTime: end } }
    const res = await fetch(`${API}/calendars/primary/events/${id}`, {
      method: 'PUT', headers: authHeader(), body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return res.json() as Promise<GCalEvent>
  }, [token, authHeader])

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    if (!token) return false
    const res = await fetch(`${API}/calendars/primary/events/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok || res.status === 204
  }, [token])

  return { isConnected, connect, disconnect, fetchEvents, createEvent, updateEvent, deleteEvent }
}
