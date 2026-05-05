import { PhoneCall } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface HelplineCardProps {
  category?: string
  tags?: string[]
}

export function HelplineCard({ category, tags = [] }: HelplineCardProps) {
  const helplines = [
    { name: 'National Emergency', number: '112', always: true },
    { name: 'NALSA Free Legal Aid', number: '15100', always: true },
  ]

  const isWomenRelated = category === 'family-criminal' || tags.includes('domestic-violence') || tags.includes('posh')
  const isCyberRelated = tags.includes('cyber') || tags.includes('online-fraud')
  const isChildRelated = tags.includes('child') || tags.includes('pocso')

  if (isWomenRelated) {
    helplines.push({ name: 'Women Helpline', number: '181', always: false })
  }
  if (isCyberRelated) {
    helplines.push({ name: 'Cyber Crime Helpline', number: '1930', always: false })
  }
  if (isChildRelated) {
    helplines.push({ name: 'Childline', number: '1098', always: false })
  }

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <PhoneCall className="h-5 w-5" />
          Important Helplines
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {helplines.map((line) => (
            <li key={line.number} className="flex justify-between items-center bg-background p-3 rounded-md border">
              <span className="font-medium">{line.name}</span>
              <a 
                href={`tel:${line.number}`} 
                className="font-bold text-lg text-primary hover:underline"
              >
                {line.number}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          In immediate danger? Get to a safe place first.
        </p>
      </CardContent>
    </Card>
  )
}
