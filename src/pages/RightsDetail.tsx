import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { linkifyCitations } from '@/lib/citationLinkifier'

interface Scenario {
  id: string
  slug: string
  title: string
  title_hi: string | null
  title_mr: string | null
  content: string
  content_hi: string | null
  content_mr: string | null
  category: string
  icon: string | null
  related_statutes: string[]
  tags: string[]
}

interface Statute {
  id: string
  act_name: string
  section: string
  title: string
  source_url: string | null
}

export default function RightsDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()

  const { data: scenario, isLoading: scenarioLoading } = useQuery({
    queryKey: ['scenario', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()
      if (error) throw error
      return data as Scenario
    },
    enabled: !!slug,
  })

  const { data: relatedStatutes } = useQuery({
    queryKey: ['statutes', scenario?.related_statutes],
    queryFn: async () => {
      if (!scenario?.related_statutes?.length) return []
      const { data, error } = await supabase
        .from('statutes')
        .select('id, act_name, section, title, source_url')
        .in('id', scenario.related_statutes)
      if (error) throw error
      return data as Statute[]
    },
    enabled: !!scenario?.related_statutes?.length,
  })

  const getContent = () => {
    if (!scenario) return ''
    const lang = i18n.language
    let content = scenario.content
    if (lang === 'hi' && scenario.content_hi) content = scenario.content_hi
    if (lang === 'mr' && scenario.content_mr) content = scenario.content_mr
    return linkifyCitations(content)
  }

  const getTitle = () => {
    if (!scenario) return ''
    const lang = i18n.language
    if (lang === 'hi' && scenario.title_hi) return scenario.title_hi
    if (lang === 'mr' && scenario.title_mr) return scenario.title_mr
    return scenario.title
  }

  if (scenarioLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">📄</div>
        <h2 className="text-xl font-semibold mb-2">Scenario not found</h2>
        <p className="text-muted-foreground mb-4">The requested scenario doesn't exist or has been removed.</p>
        <Link to="/rights">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Back button */}
      <Link to="/rights" className="inline-block mb-6">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
      </Link>

      {/* Title & Category */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>{scenario.icon || '📄'}</span>
          <span className="capitalize">{scenario.category}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold">{getTitle()}</h1>
      </div>

      {/* Content */}
      <article className="prose prose-slate dark:prose-invert max-w-none mb-12 prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {getContent()}
        </ReactMarkdown>
      </article>

      {/* Related Statutes */}
      {relatedStatutes && relatedStatutes.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">{t('rights.related_statutes')}</h2>
          <div className="space-y-3">
            {relatedStatutes.map((statute) => (
              <Card key={statute.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{statute.act_name}, Section {statute.section}</div>
                    <div className="text-sm text-muted-foreground">{statute.title}</div>
                  </div>
                  {statute.source_url ? (
                    <a
                      href={statute.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-sm text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      {t('chat.citation_unverified')}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-sm text-amber-700 dark:text-amber-300">
          {t('disclaimer.text')}
        </AlertDescription>
      </Alert>
    </div>
  )
}
