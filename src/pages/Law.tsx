import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function LawPage() {
  const { t } = useTranslation()

  const { data: statutes, isLoading } = useQuery({
    queryKey: ['statutes_index'],
    queryFn: async () => {
      // Query distinct statutes. Since there's no distinct on Supabase JS, 
      // we query all and group by slug
      const { data, error } = await supabase
        .from('statutes')
        .select('statute_slug, act_name')
        
      if (error) throw error
      
      const distinct = new Map()
      for (const row of data) {
        if (!distinct.has(row.statute_slug)) {
          distinct.set(row.statute_slug, {
            slug: row.statute_slug,
            name: row.act_name,
            count: 0
          })
        }
        distinct.get(row.statute_slug).count++
      }
      return Array.from(distinct.values())
    }
  })

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold mb-8">Statutes Index</h1>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statutes?.map(statute => (
            <Link key={statute.slug} to={\`/law/\${statute.slug}\`}>
              <Card className="hover:border-primary transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-xl uppercase">{statute.slug}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium mb-2">{statute.name}</p>
                  <p className="text-xs text-muted-foreground">{statute.count} sections indexed</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
