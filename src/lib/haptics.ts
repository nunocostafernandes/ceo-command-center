/**
 * Haptic feedback via Web Vibration API.
 * Works on Android Chrome. iOS Safari has limited support.
 * Silent no-op if not supported.
 */
export const haptics = {
  light: () => { try { navigator.vibrate?.(8) } catch {} },
  medium: () => { try { navigator.vibrate?.(15) } catch {} },
  success: () => { try { navigator.vibrate?.([10, 30, 10]) } catch {} },
  error: () => { try { navigator.vibrate?.(40) } catch {} },
  warning: () => { try { navigator.vibrate?.(25) } catch {} },
}
