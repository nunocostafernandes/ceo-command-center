import { useState, useCallback, useEffect } from 'react'
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'
import type { AccountInfo } from '@azure/msal-browser'

const MS_CLIENT_ID = 'de61a296-aec6-4677-a94c-2f9dd9957e2b'
const MS_TENANT_ID = 'd9107492-a3df-4dc6-97b9-880c66131e41'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPES = ['Calendars.ReadWrite', 'User.Read']

export interface MSCalEvent {
  id: string
  subject: string
  bodyPreview: string
  isAllDay: boolean
  start: { dateTime: string; timeZone: string }
  end:   { dateTime: string; timeZone: string }
  webLink?: string
  calendarId?: string
  calendarColor?: string
}

export interface MSCalendar {
  id: string
  name: string
  hexColor: string
  color: string
  isDefaultCalendar: boolean
  canEdit: boolean
}

// Singleton MSAL instance — initialized once at module load
const msalInstance = new PublicClientApplication({
  auth: {
    clientId: MS_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
})

// Start initialization immediately so it's ready when the hook first runs
const initPromise = msalInstance.initialize()

export function useMicrosoftCalendar() {
  const [account, setAccount] = useState<AccountInfo | null>(null)

  // After MSAL initializes, restore any cached account (previously logged in user)
  useEffect(() => {
    initPromise.then(() => {
      const accounts = msalInstance.getAllAccounts()
      if (accounts.length > 0) setAccount(accounts[0]!)
    })
  }, [])

  const isConnected = !!account

  // Get a fresh access token — silently if possible, popup if interaction required
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!account) return null
    await initPromise
    try {
      const result = await msalInstance.acquireTokenSilent({ scopes: SCOPES, account })
      return result.accessToken
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        try {
          const result = await msalInstance.acquireTokenPopup({ scopes: SCOPES })
          return result.accessToken
        } catch { return null }
      }
      return null
    }
  }, [account])

  const authHeaders = useCallback(async () => {
    const token = await getToken()
    if (!token) return null
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, [getToken])

  const connect = useCallback(async () => {
    await initPromise
    try {
      const result = await msalInstance.loginPopup({ scopes: SCOPES })
      setAccount(result.account)
    } catch (err) {
      console.error('Microsoft login failed', err)
    }
  }, [])

  const disconnect = useCallback(async () => {
    await initPromise
    try {
      if (account) await msalInstance.logoutPopup({ account })
    } catch { /* ignore */ }
    setAccount(null)
  }, [account])

  const fetchCalendars = useCallback(async (): Promise<MSCalendar[]> => {
    const headers = await authHeaders()
    if (!headers) return []
    const res = await fetch(`${GRAPH}/me/calendars?$top=50`, { headers })
    if (!res.ok) return []
    const data = await res.json() as { value?: MSCalendar[] }
    return (data.value ?? []).filter(c => c.canEdit || !c.canEdit) // include all
  }, [authHeaders])

  const fetchEvents = useCallback(async (
    timeMin: string,   // ISO string e.g. "2026-03-01T00:00:00Z"
    timeMax: string,
    calendarIds: string[] = [],
  ): Promise<MSCalEvent[]> => {
    const headers = await authHeaders()
    if (!headers) return []

    const params = new URLSearchParams({
      startDateTime: timeMin,
      endDateTime: timeMax,
      $top: '250',
      $select: 'id,subject,bodyPreview,isAllDay,start,end,webLink',
      $orderby: 'start/dateTime',
    })

    const calIds = calendarIds.length > 0 ? calendarIds : ['default']

    const results = await Promise.all(
      calIds.map(async calId => {
        const url = calId === 'default'
          ? `${GRAPH}/me/calendarView?${params}`
          : `${GRAPH}/me/calendars/${encodeURIComponent(calId)}/calendarView?${params}`
        const res = await fetch(url, { headers })
        if (!res.ok) return [] as MSCalEvent[]
        const data = await res.json() as { value?: MSCalEvent[] }
        return (data.value ?? []).map(e => ({ ...e, calendarId: calId === 'default' ? undefined : calId }))
      })
    )

    return results.flat().sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime))
  }, [authHeaders])

  const createEvent = useCallback(async (
    subject: string,
    start: string,
    end: string,
    description?: string,
    isAllDay?: boolean,
    calendarId?: string,
  ): Promise<MSCalEvent | null> => {
    const headers = await authHeaders()
    if (!headers) return null
    const body = isAllDay
      ? { subject, isAllDay: true, body: { content: description ?? '', contentType: 'text' }, start: { dateTime: `${start}T00:00:00`, timeZone: 'UTC' }, end: { dateTime: `${end}T00:00:00`, timeZone: 'UTC' } }
      : { subject, body: { content: description ?? '', contentType: 'text' }, start: { dateTime: start, timeZone: 'UTC' }, end: { dateTime: end, timeZone: 'UTC' } }
    const url = calendarId
      ? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`
      : `${GRAPH}/me/events`
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) return null
    return res.json() as Promise<MSCalEvent>
  }, [authHeaders])

  const updateEvent = useCallback(async (
    id: string,
    subject: string,
    start: string,
    end: string,
    description?: string,
    isAllDay?: boolean,
  ): Promise<MSCalEvent | null> => {
    const headers = await authHeaders()
    if (!headers) return null
    const body = isAllDay
      ? { subject, isAllDay: true, body: { content: description ?? '', contentType: 'text' }, start: { dateTime: `${start}T00:00:00`, timeZone: 'UTC' }, end: { dateTime: `${end}T00:00:00`, timeZone: 'UTC' } }
      : { subject, body: { content: description ?? '', contentType: 'text' }, start: { dateTime: start, timeZone: 'UTC' }, end: { dateTime: end, timeZone: 'UTC' } }
    const res = await fetch(`${GRAPH}/me/events/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
    if (!res.ok) return null
    return res.json() as Promise<MSCalEvent>
  }, [authHeaders])

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    const headers = await authHeaders()
    if (!headers) return false
    const res = await fetch(`${GRAPH}/me/events/${id}`, {
      method: 'DELETE',
      headers: { Authorization: headers.Authorization },
    })
    return res.ok || res.status === 204
  }, [authHeaders])

  return { isConnected, account, connect, disconnect, fetchCalendars, fetchEvents, createEvent, updateEvent, deleteEvent }
}
