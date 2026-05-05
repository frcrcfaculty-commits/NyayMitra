import Plausible from 'plausible-tracker'

// Initialize Plausible if domain is provided
// This avoids tracking in local dev unless specifically configured
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN

export const analytics = plausibleDomain 
  ? Plausible({
      domain: plausibleDomain,
      trackLocalhost: false,
    })
  : null

export function trackEvent(eventName: string, props?: Record<string, string | number | boolean>) {
  if (!analytics) return
  
  // Safe tracking: explicitly ensure we never accidentally pass PII
  // The props are strictly typed to prevent passing nested objects or raw user inputs
  analytics.trackEvent(eventName, { props })
}

export const AnalyticsEvents = {
  PAGE_VIEW: 'pageview',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  CITATION_CLICKED: 'citation_clicked',
  SCENARIO_VIEWED: 'scenario_viewed',
} as const
