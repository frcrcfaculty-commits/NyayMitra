import { describe, it, expect } from 'vitest'
import { linkifyCitations } from '@/lib/citationLinkifier'

describe('citationLinkifier', () => {
  it('linkifies BNS sections', () => {
    expect(linkifyCitations('Under BNS s.103, murder is...')).toBe(
      'Under [BNS s.103](/law/bns/103), murder is...'
    )
  })

  it('linkifies Section notation', () => {
    expect(linkifyCitations('Under BNSS Section 173...')).toBe(
      'Under [BNSS Section 173](/law/bnss/173)...'
    )
  })

  it('does not linkify already linked text', () => {
    expect(
      linkifyCitations('Under [BNS s.103](https://example.com) it says')
    ).toBe('Under [BNS s.103](https://example.com) it says')
  })

  it('handles Constitution Articles', () => {
    expect(
      linkifyCitations('Right to life under Constitution Article 21 is fundamental')
    ).toBe(
      'Right to life under [Constitution Article 21](/law/constitution/21) is fundamental'
    )
  })

  it('ignores case for matching but preserves for display', () => {
    expect(linkifyCitations('under bns s.103')).toBe(
      'under [bns s.103](/law/bns/103)'
    )
  })

  it('returns empty string for empty input', () => {
    expect(linkifyCitations('')).toBe('')
  })

  it('returns original for text without citations', () => {
    expect(linkifyCitations('This is a normal sentence.')).toBe(
      'This is a normal sentence.'
    )
  })
})
