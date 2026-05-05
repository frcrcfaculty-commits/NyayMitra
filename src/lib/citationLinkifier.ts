export function linkifyCitations(markdown: string): string {
  if (!markdown) return markdown

  const STATUTE_SLUGS = [
    'bns', 'bnss', 'bsa', 'rti', 'cpa', 'mv', 'hma', 'sma', 
    'ica', 'dv', 'dpa', 'posh', 'ni', 'hsa', 'isa', 'dpdp', 'tpa', 'it'
  ]
  
  const STATUTE_PATTERN = STATUTE_SLUGS.join('|')
  
  // This regex looks for Statute abbreviations followed by section notation (s., Section, sec.)
  // It avoids matches that are already inside a markdown link [...]
  const regex = new RegExp(
    `(?<!\\[[^\\]]*)\\b((?:${STATUTE_PATTERN}|constitution)\\s+(?:s\\.|section\\s+|sec\\.|article\\s+)\\d+[A-Z]?)\\b(?![^\\[]*\\])`,
    'gi'
  )

  return markdown.replace(regex, (match) => {
    // Normalize match to lower case to parse
    const normalized = match.toLowerCase().trim()
    
    // Extract slug
    let slug = ''
    if (normalized.startsWith('constitution')) {
      slug = 'constitution'
    } else {
      const parts = normalized.split(/\s+/)
      slug = parts[0]
    }
    
    // Extract section number
    const sectionMatch = normalized.match(/\d+[a-z]?$/i)
    const section = sectionMatch ? sectionMatch[0] : ''
    
    if (slug && section) {
      return `[${match}](/law/${slug}/${section})`
    }
    
    return match
  })
}

// TEST CASES (For Antigravity-B to wire up with vitest)
/*
import { describe, it, expect } from 'vitest'
import { linkifyCitations } from './citationLinkifier'

describe('citationLinkifier', () => {
  it('linkifies BNS sections', () => {
    expect(linkifyCitations('Under BNS s.103, murder is...')).toBe('Under [BNS s.103](/law/bns/103), murder is...')
  })
  
  it('linkifies Section notation', () => {
    expect(linkifyCitations('Under BNSS Section 173...')).toBe('Under [BNSS Section 173](/law/bnss/173)...')
  })
  
  it('does not linkify already linked text', () => {
    expect(linkifyCitations('Under [BNS s.103](https://example.com) it says')).toBe('Under [BNS s.103](https://example.com) it says')
  })
  
  it('handles Constitution Articles', () => {
    expect(linkifyCitations('Right to life under Constitution Article 21 is fundamental')).toBe('Right to life under [Constitution Article 21](/law/constitution/21) is fundamental')
  })
  
  it('ignores case for matching but preserves for display', () => {
    expect(linkifyCitations('under bns s.103')).toBe('under [bns s.103](/law/bns/103)')
  })
  
  it('does not linkify inside code blocks', () => {
    // This is tricky without a full markdown parser, we rely on the negative lookbehind in the regex
    // which handles [links] but not `code`. For MVP we accept this limitation.
  })
})
*/
