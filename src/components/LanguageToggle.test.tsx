import { describe, it, expect } from 'vitest'
import { screen } from '@/test/test-utils'
import { render } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { LanguageToggle } from '@/components/LanguageToggle'

describe('LanguageToggle', () => {
  it('renders the language toggle button', () => {
    render(<LanguageToggle />)
    const button = screen.getByLabelText('Language')
    expect(button).toBeInTheDocument()
  })

  it('shows dropdown with language options when clicked', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)
    
    const button = screen.getByLabelText('Language')
    await user.click(button)
    
    expect(screen.getAllByText('English').length).toBeGreaterThan(0)
    expect(screen.getAllByText('हिन्दी').length).toBeGreaterThan(0)
    expect(screen.getAllByText('मराठी').length).toBeGreaterThan(0)
  })
})
