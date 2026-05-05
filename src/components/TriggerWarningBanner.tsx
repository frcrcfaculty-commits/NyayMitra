import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface TriggerWarningBannerProps {
  message: string
}

export function TriggerWarningBanner({ message }: TriggerWarningBannerProps) {
  if (!message) return null

  return (
    <Alert variant="destructive" className="mb-6 border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400">
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="font-semibold text-base mb-2">Content Warning</AlertTitle>
      <AlertDescription className="text-sm leading-relaxed font-medium">
        {message}
      </AlertDescription>
    </Alert>
  )
}
