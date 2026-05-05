/**
 * Cross-code resolver. Maps repealed criminal code references (IPC, CrPC,
 * Indian Evidence Act) to their successors (BNS, BNSS, BSA), and back.
 *
 * Use cases:
 * - Rights-detail page receives "BNS s.85, formerly IPC s.498A" — render
 *   both as clickable, where IPC link points to the BNS successor with
 *   a "(this section was repealed; redirected to its BNS successor)" badge.
 * - Chat function: when retrieval misses, expand "IPC s.302" in the user's
 *   query to also try "BNS s.103" before giving up.
 * - Statute browser: visiting /law/ipc/498A redirects to /law/bns/85 with a
 *   one-line transition notice.
 *
 * Data source: content/cross_mapping.json — sourced from the UP Police BNS-IPC
 * comparative table, BPRD BNSS-CrPC comparison, and NCRB BSA section table.
 * Coverage: ~254 entries focused on citizen-relevant sections; not exhaustive.
 */

import mappingJson from "../../content/cross_mapping.json"

interface MappingEntry {
  bns?: string | null
  bnss?: string | null
  bsa?: string | null
  ipc?: string | null
  crpc?: string | null
  iea?: string | null
  title: string
  notes?: string
}

interface Mapping {
  [oldSection: string]: MappingEntry
}

interface CrossMappingFile {
  version: string
  last_updated: string
  in_force_date: string
  ipc_to_bns: Mapping
  bns_to_ipc: Mapping
  crpc_to_bnss: Mapping
  bnss_to_crpc: Mapping
  iea_to_bsa: Mapping
  bsa_to_iea: Mapping
  [k: string]: unknown
}

const data = mappingJson as unknown as CrossMappingFile

// -----------------------------------------------------------------------
// Old codes → new codes (the most common direction).
// -----------------------------------------------------------------------

export type OldCode = "ipc" | "crpc" | "iea"
export type NewCode = "bns" | "bnss" | "bsa"

interface ResolutionResult {
  newCode: NewCode
  newSection: string | null      // null if the old section was deleted with no successor
  title: string
  notes?: string
  isDeleted: boolean             // true when old section is repealed with no successor (e.g. sedition)
}

/**
 * Resolve an old-code reference to its new-code successor.
 *
 * Examples:
 *   resolveOldToNew("ipc", "498A") → { newCode: "bns", newSection: "85", title: ..., isDeleted: false }
 *   resolveOldToNew("ipc", "377")  → { newCode: "bns", newSection: null, title: "Unnatural offences", isDeleted: true }
 *   resolveOldToNew("crpc", "999") → null
 */
export function resolveOldToNew(
  oldCode: OldCode,
  oldSection: string
): ResolutionResult | null {
  const map: Mapping | undefined = {
    ipc: data.ipc_to_bns,
    crpc: data.crpc_to_bnss,
    iea: data.iea_to_bsa,
  }[oldCode]

  if (!map) return null

  // Normalise the section input — handle "498A", "498-A", "498 A"
  const normalised = oldSection.replace(/\s|-/g, "").toUpperCase()
  const entry = map[oldSection] || map[normalised] || map[oldSection.toUpperCase()]
  if (!entry) return null

  const newCode: NewCode = oldCode === "ipc" ? "bns" : oldCode === "crpc" ? "bnss" : "bsa"
  const newSection = (entry[newCode] ?? null) as string | null

  return {
    newCode,
    newSection,
    title: entry.title,
    notes: entry.notes,
    isDeleted: newSection === null,
  }
}

// -----------------------------------------------------------------------
// New codes → old codes (less common; useful for "(formerly IPC s.X)" labels).
// -----------------------------------------------------------------------

interface ReverseResolutionResult {
  oldCode: OldCode
  oldSection: string | null
  title: string
  notes?: string
}

export function resolveNewToOld(
  newCode: NewCode,
  newSection: string
): ReverseResolutionResult | null {
  const map: Mapping | undefined = {
    bns: data.bns_to_ipc,
    bnss: data.bnss_to_crpc,
    bsa: data.bsa_to_iea,
  }[newCode]

  if (!map) return null

  const normalised = newSection.replace(/\s|-/g, "").toUpperCase()
  const entry = map[newSection] || map[normalised] || map[newSection.toUpperCase()]
  if (!entry) return null

  const oldCode: OldCode = newCode === "bns" ? "ipc" : newCode === "bnss" ? "crpc" : "iea"
  const oldSection = (entry[oldCode] ?? null) as string | null

  return {
    oldCode,
    oldSection,
    title: entry.title,
    notes: entry.notes,
  }
}

// -----------------------------------------------------------------------
// URL helpers — used by the statute browser and the citation linkifier.
// -----------------------------------------------------------------------

/**
 * Build the redirect URL from an old-code citation. For deleted sections
 * (no successor), returns a notice URL that can be handled by a 410-style
 * page on the frontend.
 */
export function urlForOldReference(oldCode: OldCode, oldSection: string): string | null {
  const r = resolveOldToNew(oldCode, oldSection)
  if (!r) return null
  if (r.isDeleted) return `/law/repealed/${oldCode}/${oldSection}`
  return `/law/${r.newCode}/${r.newSection}`
}

/**
 * Pretty cross-mapping label, e.g. "BNS s.85 (formerly IPC s.498A)".
 * Used in scenario page headers and search results.
 */
export function formatCrossLabel(newCode: NewCode, newSection: string): string {
  const r = resolveNewToOld(newCode, newSection)
  if (!r || !r.oldSection) return `${newCode.toUpperCase()} s.${newSection}`
  const oldName = r.oldCode.toUpperCase()
  return `${newCode.toUpperCase()} s.${newSection} (formerly ${oldName} s.${r.oldSection})`
}

// -----------------------------------------------------------------------
// Bulk lookup — useful for query-expansion in the chat function. Given
// a piece of text containing IPC/CrPC/IEA references, return all the
// new-code equivalents we should also retrieve over.
// -----------------------------------------------------------------------

const OLD_REFERENCE_RE = new RegExp(
  String.raw`\b(IPC|CrPC|Indian Evidence Act|IEA)\s+(?:s\.?|section|sec\.?|art\.?)?\s*(\d+[A-Za-z]?)\b`,
  "gi"
)

export function expandQueryWithNewCodes(text: string): string[] {
  const expansions: string[] = []
  let m: RegExpExecArray | null
  OLD_REFERENCE_RE.lastIndex = 0
  while ((m = OLD_REFERENCE_RE.exec(text)) !== null) {
    const codeRaw = m[1].toLowerCase().replace(/\s/g, "")
    const oldCode: OldCode | null =
      codeRaw === "ipc"
        ? "ipc"
        : codeRaw === "crpc"
          ? "crpc"
          : codeRaw === "indianevidenceact" || codeRaw === "iea"
            ? "iea"
            : null
    if (!oldCode) continue
    const r = resolveOldToNew(oldCode, m[2])
    if (r && r.newSection) {
      expansions.push(`${r.newCode.toUpperCase()} s.${r.newSection}`)
    }
  }
  return expansions
}

export const _cross_mapping_metadata = {
  version: data.version,
  lastUpdated: data.last_updated,
  inForceDate: data.in_force_date,
}
