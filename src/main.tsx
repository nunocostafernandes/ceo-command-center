import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Toaster } from 'sonner'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { queryClient } from './lib/queryClient'

const GOOGLE_CLIENT_ID = '1058981481555-rrkb1m8mfc3lohhnsnol1mkctkbrjgkt.apps.googleusercontent.com'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#0f0f12',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.92)',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
