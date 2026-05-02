import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BookOpen, MessageCircle, Globe, ArrowRight, Shield, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function HomePage() {
  const { t } = useTranslation()

  const features = [
    {
      icon: BookOpen,
      title: t('home.features.rights.title'),
      description: t('home.features.rights.description'),
      gradient: 'from-orange-500 to-amber-500',
      link: '/rights',
    },
    {
      icon: MessageCircle,
      title: t('home.features.chat.title'),
      description: t('home.features.chat.description'),
      gradient: 'from-emerald-500 to-teal-500',
      link: '/chat',
    },
    {
      icon: Globe,
      title: t('home.features.multilingual.title'),
      description: t('home.features.multilingual.description'),
      gradient: 'from-blue-500 to-indigo-500',
      link: '#',
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-950 dark:to-emerald-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-100/40 via-transparent to-transparent dark:from-orange-900/20" />

        <div className="container relative mx-auto px-4 py-16 sm:py-24 lg:py-32">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm font-medium mb-6 animate-fade-in">
              <Shield className="h-4 w-4" />
              {t('app.tagline')}
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              <span className="gradient-text">{t('home.hero_title')}</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              {t('home.hero_subtitle')}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/rights">
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5"
                  id="cta-rights"
                >
                  <BookOpen className="h-5 w-5" />
                  {t('home.cta_rights')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/chat">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto gap-2 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-all duration-300 hover:-translate-y-0.5"
                  id="cta-chat"
                >
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  {t('home.cta_chat')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <Link key={i} to={feature.link} className="group">
              <Card className="h-full border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats / Trust Section */}
      <section className="border-t border-b bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '500+', label: 'Legal Scenarios' },
              { value: '50+', label: 'Indian Acts Covered' },
              { value: '3', label: 'Languages' },
              { value: '24/7', label: 'Available' },
            ].map((stat, i) => (
              <div key={i} className="space-y-1">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { step: '1', title: 'Choose a Scenario', desc: 'Browse common legal situations you might face', icon: BookOpen },
            { step: '2', title: 'Understand Your Rights', desc: 'Read clear explanations with statute references', icon: Scale },
            { step: '3', title: 'Get AI Guidance', desc: 'Ask follow-up questions to our AI assistant', icon: MessageCircle },
          ].map((item, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4 border border-primary/10">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="text-xs font-bold text-primary/60 uppercase tracking-wider mb-1">Step {item.step}</div>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
