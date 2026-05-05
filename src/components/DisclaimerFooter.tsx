import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

export function DisclaimerFooter() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border mt-auto">
      <div className="disclaimer-bar bg-warning/10 border-b border-warning/20">
        <div className="container mx-auto px-4 py-3">
          <p className="text-xs text-center text-muted-foreground leading-relaxed flex items-start sm:items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-foreground">Disclaimer:</strong> This tool provides general legal information. It does not create a lawyer–client relationship and is not a substitute for advice from a qualified advocate. NyayMitra is not a law firm; we are not authorised to practise law under the Advocates Act, 1961. Always consult an advocate for case-specific guidance.
            </span>
          </p>
        </div>
      </div>
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {currentYear} NyayMitra. {t('disclaimer.short') || 'For educational purposes only. Not legal advice.'}</p>
          <div className="flex gap-4">
            <Link to="#" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="#" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="#" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
