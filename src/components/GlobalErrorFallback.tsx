import { AlertTriangle, RefreshCcw, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface GlobalErrorFallbackProps {
  error?: Error
  resetError?: () => void
}

export function GlobalErrorFallback({ resetError }: GlobalErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/20 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4 pt-4">
          <p className="text-muted-foreground">
            We've encountered an unexpected error and have been notified to fix it.
          </p>
          
          <div className="bg-muted/50 p-4 rounded-lg border text-sm text-left">
            <p className="font-semibold text-foreground flex items-center gap-2 mb-2">
              <Phone className="h-4 w-4 text-primary" />
              Need immediate help?
            </p>
            <p className="text-muted-foreground">
              If you are in distress and need legal assistance right now, please call the NALSA Free Legal Aid Helpline at <strong className="text-foreground">15100</strong>.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center pt-2 pb-6">
          <Button 
            onClick={() => {
              if (resetError) {
                resetError()
              } else {
                window.location.reload()
              }
            }} 
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Reload Page
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
