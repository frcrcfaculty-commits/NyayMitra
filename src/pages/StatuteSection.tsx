import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function StatuteSectionPage() {
  const { slug, section } = useParams<{ slug: string, section?: string }>()

  // Fetch sections for the index if no specific section is provided
  const { data: index, isLoading: indexLoading } = useQuery({
    queryKey: ['statute_index', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statutes')
        .select('section, title')
        .eq('statute_slug', slug)
        // Ensure proper numeric ordering if possible, otherwise string sort
        .order('section_number_int', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
    enabled: !section && !!slug
  })

  // Fetch specific section details if section is provided
  const { data: sectionData, isLoading: sectionLoading } = useQuery({
    queryKey: ['statute_section', slug, section],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statutes')
        .select('*')
        .eq('statute_slug', slug)
        .eq('section', section)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!section && !!slug
  })

  // Fetch related scenarios if viewing a section
  const { data: relatedScenarios } = useQuery({
    queryKey: ['related_scenarios', slug, section],
    queryFn: async () => {
      const key_section = `${slug?.toUpperCase()} s.${section}`
      const { data, error } = await supabase
        .from('scenarios')
        .select('slug, title, icon')
        .contains('key_sections', [key_section])
      if (error) throw error
      return data
    },
    enabled: !!section && !!slug
  })

  if (!section) {
    // Render Index
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/law" className="inline-block mb-6">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Statutes
          </Button>
        </Link>
        <h1 className="text-3xl font-bold mb-8 uppercase">{slug} - Index</h1>
        
        {indexLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {index?.map(item => (
              <Link key={item.section} to={`/law/${slug}/${item.section}`}>
                <div className="p-4 rounded-lg border hover:bg-accent transition-colors">
                  <span className="font-semibold w-24 inline-block">Section {item.section}</span>
                  <span className="text-muted-foreground">{item.title}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Render Section detail
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link to={`/law/${slug}`} className="inline-block mb-6">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {slug?.toUpperCase()} Index
        </Button>
      </Link>
      
      {sectionLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : sectionData ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h1 className="text-3xl font-bold mb-2">Section {sectionData.section}</h1>
            <h2 className="text-xl text-muted-foreground mb-8">{sectionData.title}</h2>
            
            <div className="prose prose-slate dark:prose-invert max-w-none">
              {/* Displaying plain text as requested */}
              <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed">
                {sectionData.full_text}
              </div>
            </div>

            {sectionData.source_url && (
              <div className="mt-8 pt-8 border-t">
                <a href={sectionData.source_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-2">
                    View original on IndiaCode <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </div>
            )}
          </div>

          <div>
            <div className="sticky top-24">
              <h3 className="font-semibold text-lg mb-4">Related Scenarios</h3>
              {relatedScenarios && relatedScenarios.length > 0 ? (
                <div className="space-y-3">
                  {relatedScenarios.map(scenario => (
                    <Link key={scenario.slug} to={`/rights/${scenario.slug}`}>
                      <Card className="hover:border-primary transition-colors">
                        <CardContent className="p-4 flex items-center gap-3">
                          <span className="text-2xl">{scenario.icon || '📄'}</span>
                          <span className="font-medium text-sm">{scenario.title}</span>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No citizen scenarios mapped to this section yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Section not found</h2>
          <p className="text-muted-foreground">We couldn't find section {section} of {slug?.toUpperCase()}.</p>
        </div>
      )}
    </div>
  )
}
