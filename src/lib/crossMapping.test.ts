import { describe, it, expect } from 'vitest'
import {
  resolveOldToNew,
  resolveNewToOld,
  urlForOldReference,
  formatCrossLabel,
  expandQueryWithNewCodes,
} from './crossMapping'

describe('crossMapping', () => {
  describe('resolveOldToNew', () => {
    it('resolves IPC 498A to BNS 85 (cruelty)', () => {
      const r = resolveOldToNew('ipc', '498A')
      expect(r).not.toBeNull()
      expect(r!.newCode).toBe('bns')
      expect(r!.newSection).toBe('85')
      expect(r!.isDeleted).toBe(false)
    })

    it('resolves IPC 302 to BNS 103 (punishment for murder)', () => {
      expect(resolveOldToNew('ipc', '302')!.newSection).toBe('103')
    })

    it('resolves IPC 304B to BNS 80 (dowry death)', () => {
      expect(resolveOldToNew('ipc', '304B')!.newSection).toBe('80')
    })

    it('flags deleted sections — IPC 124A sedition has no successor', () => {
      const r = resolveOldToNew('ipc', '124A')
      expect(r).not.toBeNull()
      expect(r!.isDeleted).toBe(true)
      expect(r!.newSection).toBe(null)
      expect(r!.notes).toContain('Repealed')
    })

    it('flags deleted IPC 377 (no successor)', () => {
      const r = resolveOldToNew('ipc', '377')
      expect(r!.isDeleted).toBe(true)
    })

    it('resolves CrPC 154 → BNSS 173 (FIR)', () => {
      expect(resolveOldToNew('crpc', '154')!.newSection).toBe('173')
    })

    it('resolves CrPC 167 → BNSS 187 (default bail)', () => {
      expect(resolveOldToNew('crpc', '167')!.newSection).toBe('187')
    })

    it('resolves CrPC 438 → BNSS 482 (anticipatory bail)', () => {
      expect(resolveOldToNew('crpc', '438')!.newSection).toBe('482')
    })

    it('resolves IEA 65B → BSA 63 (electronic evidence)', () => {
      expect(resolveOldToNew('iea', '65B')!.newSection).toBe('63')
    })

    it('resolves IEA 113B → BSA 118 (dowry death presumption)', () => {
      expect(resolveOldToNew('iea', '113B')!.newSection).toBe('118')
    })

    it('returns null for unknown sections', () => {
      expect(resolveOldToNew('ipc', '99999')).toBeNull()
    })
  })

  describe('resolveNewToOld', () => {
    it('resolves BNS 85 back to IPC 498A', () => {
      expect(resolveNewToOld('bns', '85')!.oldSection).toBe('498A')
    })

    it('resolves BNSS 173 back to CrPC 154', () => {
      expect(resolveNewToOld('bnss', '173')!.oldSection).toBe('154')
    })

    it('returns null oldSection for new sections without IPC equivalent', () => {
      const r = resolveNewToOld('bns', '111') // organised crime — NEW
      expect(r).not.toBeNull()
      expect(r!.oldSection).toBe(null)
    })

    it('returns null oldSection for BNSS s.479 (NEW undertrial bail)', () => {
      expect(resolveNewToOld('bnss', '479')!.oldSection).toBe(null)
    })
  })

  describe('urlForOldReference', () => {
    it('builds /law/bns/103 for IPC 302', () => {
      expect(urlForOldReference('ipc', '302')).toBe('/law/bns/103')
    })

    it('builds /law/bnss/482 for CrPC 438', () => {
      expect(urlForOldReference('crpc', '438')).toBe('/law/bnss/482')
    })

    it('builds /law/repealed/ipc/124A for sedition (deleted, no successor)', () => {
      expect(urlForOldReference('ipc', '124A')).toBe('/law/repealed/ipc/124A')
    })
  })

  describe('formatCrossLabel', () => {
    it('formats BNS 85 with IPC predecessor', () => {
      expect(formatCrossLabel('bns', '85')).toBe('BNS s.85 (formerly IPC s.498A)')
    })

    it('falls back to plain label when there is no predecessor', () => {
      expect(formatCrossLabel('bns', '111')).toBe('BNS s.111')
    })
  })

  describe('expandQueryWithNewCodes', () => {
    it('expands IPC references in a query', () => {
      const result = expandQueryWithNewCodes('What is the punishment under IPC s.302?')
      expect(result).toContain('BNS s.103')
    })

    it('expands multiple references', () => {
      const result = expandQueryWithNewCodes('Compare IPC 498A with IPC 304B in dowry cases')
      expect(result).toContain('BNS s.85')
      expect(result).toContain('BNS s.80')
    })

    it('handles CrPC references', () => {
      const result = expandQueryWithNewCodes('Filing FIR under CrPC s.154')
      expect(result).toContain('BNSS s.173')
    })

    it('returns empty array for queries with no old-code references', () => {
      const result = expandQueryWithNewCodes('What does the BNS say about murder?')
      expect(result).toEqual([])
    })
  })
})
