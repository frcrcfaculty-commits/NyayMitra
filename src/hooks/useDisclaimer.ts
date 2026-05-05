import { useTranslation } from 'react-i18next'

/**
 * Returns the disclaimer text strings used across the app.
 * Centralises the compliance-critical text in one place.
 */
export function useDisclaimer() {
  const { t } = useTranslation()

  return {
    /** Full disclaimer text for footer bars */
    full: t('disclaimer.text'),
    /** Short disclaimer for compact contexts */
    short: t('disclaimer.short'),
    /** Chat-specific disclaimer */
    chat: t('chat.disclaimer_chat'),
  }
}
