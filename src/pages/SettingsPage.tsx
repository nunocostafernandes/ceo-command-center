import { CalendarDays, Mail, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useMicrosoftCalendar } from '@/hooks/useMicrosoftCalendar'

export function SettingsPage() {
  const gcal  = useGoogleCalendar()
  const mscal = useMicrosoftCalendar()

  return (
    <div className="px-4 pt-[calc(var(--safe-top)+24px)] pb-8 max-w-xl mx-auto lg:px-8">
      <h1 className="text-2xl font-bold text-text-primary mb-8">Settings</h1>

      {/* Connected Calendars */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Connected Calendars</h2>

        <div className="card-glass divide-y divide-white/[0.06]">

          {/* Google Calendar */}
          <div className="p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <CalendarDays size={18} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Google Calendar</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                {gcal.isConnected ? 'Connected — events visible in Calendar' : 'Not connected'}
              </p>
            </div>
            {gcal.isConnected ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Check size={13} strokeWidth={2.5} />
                  <span className="text-xs font-medium">Connected</span>
                </div>
                <button
                  onClick={() => { gcal.disconnect(); toast.success('Google Calendar disconnected') }}
                  className="text-xs text-text-tertiary hover:text-status-error transition-colors px-2 py-1 rounded-lg hover:bg-status-error/10"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => gcal.connect()}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors flex-shrink-0"
              >
                Connect
              </button>
            )}
          </div>

          {/* Outlook / Microsoft */}
          <div className="p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center flex-shrink-0">
              <Mail size={18} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Outlook / Office 365</p>
              <p className="text-xs text-text-tertiary mt-0.5">
                {mscal.isConnected
                  ? `Connected as ${mscal.account?.username ?? mscal.account?.name ?? 'Microsoft account'}`
                  : 'Not connected'}
              </p>
            </div>
            {mscal.isConnected ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-sky-400">
                  <Check size={13} strokeWidth={2.5} />
                  <span className="text-xs font-medium">Connected</span>
                </div>
                <button
                  onClick={() => { void mscal.disconnect(); toast.success('Outlook disconnected') }}
                  className="text-xs text-text-tertiary hover:text-status-error transition-colors px-2 py-1 rounded-lg hover:bg-status-error/10"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => mscal.connect()}
                className="px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-medium hover:bg-sky-500/25 transition-colors flex-shrink-0"
              >
                Connect
              </button>
            )}
          </div>

        </div>

        <p className="text-[11px] text-text-tertiary mt-2 px-1">
          Connected calendars appear in the Calendar view. Events are fetched directly from Google / Microsoft — nothing is stored on our servers.
        </p>
      </section>
    </div>
  )
}
