import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { analytics } from '@/lib/analytics'
import { GlobalErrorFallback } from '@/components/GlobalErrorFallback'
import 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Initialize Sentry for error tracking
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1, // Required by task: tracesSampleRate: 0.1
  })
}

// Enable Plausible auto pageviews for SPA if analytics is configured
if (analytics) {
  analytics.enableAutoPageviews()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<GlobalErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
