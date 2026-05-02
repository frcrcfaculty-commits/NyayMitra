import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronRight, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface Scenario {
  id: string
  slug: string
  title: string
  title_hi: string | null
  title_mr: string | null
  summary: string
  summary_hi: string | null
  summary_mr: string | null
  category: string
  icon: string | null
  tags: string[]
}

const categoryIcons: Record<string, string> = {
  tenant: '🏠',
  consumer: '🛒',
  workplace: '💼',
  criminal: '⚖️',
  family: '👨‍👩‍👧‍👦',
  rti: '📋',
}

export default function RightsPage() {
  const { t, i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  const { data: scenarios, isLoading, error } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, slug, title, title_hi, title_mr, summary, summary_hi, summary_mr, category, icon, tags')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as Scenario[]
    },
  })

  const categories = ['all', 'tenant', 'consumer', 'workplace', 'criminal', 'family', 'rti']

  const getLocalizedField = (item: Scenario, field: 'title' | 'summary') => {
    const lang = i18n.language
    if (lang === 'hi' && item[`${field}_hi`]) return item[`${field}_hi`]!
    if (lang === 'mr' && item[`${field}_mr`]) return item[`${field}_mr`]!
    return item[field]
  }

  const filteredScenarios = scenarios?.filter((s) => {
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory
    const title = getLocalizedField(s, 'title').toLowerCase()
    const summary = getLocalizedField(s, 'summary').toLowerCase()
    const matchesSearch = !searchQuery || title.includes(searchQuery.toLowerCase()) || summary.includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="max-w-2xl mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">
          <span className="gradient-text">{t('rights.title')}</span>
        </h1>
        <p className="text-muted-foreground">{t('rights.subtitle')}</p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('rights.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            id="rights-search"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted-foreground mr-1 hidden sm:block" />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 mb-8" id="category-filters">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
            className="gap-1.5 transition-all duration-200"
            id={`category-${cat}`}
          >
            {cat !== 'all' && <span>{categoryIcons[cat] || '📄'}</span>}
            {t(`rights.categories.${cat}`)}
          </Button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-3/4 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-center">
            <p className="text-destructive mb-2">{t('common.error')}</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      )}

      {/* Scenarios Grid */}
      {filteredScenarios && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredScenarios.map((scenario) => (
            <Link
              key={scenario.id}
              to={`/rights/${scenario.slug}`}
              className="group"
            >
              <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-transparent hover:border-primary/20 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{scenario.icon || categoryIcons[scenario.category] || '📄'}</span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                    {getLocalizedField(scenario, 'title')}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {getLocalizedField(scenario, 'summary')}
                  </p>
                  {scenario.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {scenario.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Empty State */}
      {filteredScenarios && filteredScenarios.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="font-semibold text-lg mb-2">No scenarios found</h3>
          <p className="text-muted-foreground">Try adjusting your search or category filter.</p>
        </div>
      )}
    </div>
  )
}
