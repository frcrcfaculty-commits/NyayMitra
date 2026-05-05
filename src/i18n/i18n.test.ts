import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en.json'
import hi from '@/i18n/locales/hi.json'
import mr from '@/i18n/locales/mr.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path)
    }
    return [path]
  })
}

describe('i18n locale completeness', () => {
  const enKeys = flattenKeys(en)
  const hiKeys = flattenKeys(hi)
  const mrKeys = flattenKeys(mr)

  it('English locale has keys', () => {
    expect(enKeys.length).toBeGreaterThan(0)
  })

  it('all English keys exist in Hindi', () => {
    const missingInHi = enKeys.filter(k => !hiKeys.includes(k))
    expect(missingInHi).toEqual([])
  })

  it('all English keys exist in Marathi', () => {
    const missingInMr = enKeys.filter(k => !mrKeys.includes(k))
    expect(missingInMr).toEqual([])
  })

  it('Hindi does not have extra keys not in English', () => {
    const extraInHi = hiKeys.filter(k => !enKeys.includes(k))
    expect(extraInHi).toEqual([])
  })

  it('Marathi does not have extra keys not in English', () => {
    const extraInMr = mrKeys.filter(k => !enKeys.includes(k))
    expect(extraInMr).toEqual([])
  })
})
