import { describe, it, expect } from 'vitest'
import { screen } from '@/test/test-utils'
import { render } from '@/test/test-utils'
import { Layout } from '@/components/Layout'

describe('Layout', () => {
  it('renders without crashing', () => {
    render(
      <Layout>
        <div data-testid="child">Test content</div>
      </Layout>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders the NyayMitra logo/branding', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    expect(screen.getByText('NyayMitra')).toBeInTheDocument()
  })

  it('disclaimer footer is present', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    const disclaimerText = screen.getByText(/This tool provides general legal information/i)
    expect(disclaimerText).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Know Your Rights')).toBeInTheDocument()
    expect(screen.getByText('Ask NyayMitra')).toBeInTheDocument()
  })
})
