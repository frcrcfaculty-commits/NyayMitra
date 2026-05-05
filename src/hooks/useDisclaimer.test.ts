import { describe, it, expect } from 'vitest'
import { renderHook } from '@/test/test-utils'
import { useDisclaimer } from '@/hooks/useDisclaimer'

describe('useDisclaimer', () => {
  it('returns full disclaimer text', () => {
    const { result } = renderHook(() => useDisclaimer())
    expect(result.current.full).toContain('NyayMitra')
    expect(result.current.full).toContain('NOT a law firm')
  })

  it('returns short disclaimer text', () => {
    const { result } = renderHook(() => useDisclaimer())
    expect(result.current.short).toContain('Not legal advice')
  })

  it('returns chat disclaimer text', () => {
    const { result } = renderHook(() => useDisclaimer())
    expect(result.current.chat).toContain('not legal advice')
  })
})
