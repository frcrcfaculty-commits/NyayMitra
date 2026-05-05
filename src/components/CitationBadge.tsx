import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'

interface CitationBadgeProps {
  citation: string // e.g. "BNSS s.173"
  tooltipText?: string // e.g. "Report of police officer on completion of investigation"
  href?: string // Link to the statute page
  verified?: boolean
  children?: ReactNode
}

export function CitationBadge({ citation, tooltipText, href, verified = true, children }: CitationBadgeProps) {
  const badgeContent = (
    <Badge 
      variant={verified ? "secondary" : "outline"}
      className={`gap-1 px-2 py-0.5 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors font-mono text-xs ${!verified ? 'border-amber-500 text-amber-600' : ''}`}
    >
      <BookOpen className="h-3 w-3" />
      {children || citation}
    </Badge>
  )

  const wrappedBadge = href ? (
    <Link to={href} className="inline-block no-underline">
      {badgeContent}
    </Link>
  ) : badgeContent

  if (!tooltipText) {
    return wrappedBadge
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {wrappedBadge}
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px] p-3 text-sm leading-relaxed">
          <p className="font-semibold mb-1 text-xs text-muted-foreground uppercase">{citation}</p>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
