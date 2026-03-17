import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'signin' | 'signup' | 'forgot'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, signUp, resetPassword } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const inputClass =
    'bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm w-full focus:outline-none focus:border-accent text-text-primary placeholder-text-tertiary transition-colors'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) { setError(err.message); return }
        navigate('/dashboard')
      } else if (mode === 'signup') {
        const { error: err } = await signUp(email, password, fullName)
        if (err) { setError(err.message); return }
        setMessage('Check your email to confirm your account.')
      } else {
        const { error: err } = await resetPassword(email)
        if (err) { setError(err.message); return }
        setMessage('Password reset link sent. Check your email.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="card-glass p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-accent mb-2">⌘</div>
          <h1 className="text-xl font-bold text-text-primary">Command Center</h1>
          <p className="text-sm text-text-secondary mt-1">Personal productivity HQ</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-3"
          >
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className={inputClass}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
              required
            />
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
                required
              />
            )}

            {error && <p className="text-status-error text-sm">{error}</p>}
            {message && <p className="text-status-success text-sm">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white rounded-btn py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </motion.form>
        </AnimatePresence>

        <div className="mt-5 text-center space-y-2">
          {mode === 'signin' && (
            <>
              <button onClick={() => { setMode('signup'); setError(null) }} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                Don't have an account? <span className="text-accent">Sign up</span>
              </button>
              <br />
              <button onClick={() => { setMode('forgot'); setError(null) }} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => { setMode('signin'); setError(null) }} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
              Already have an account? <span className="text-accent">Sign in</span>
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('signin'); setError(null) }} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
              Back to <span className="text-accent">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
