# Compliance

> **This is not legal advice.** This is the project's working compliance
> posture, drafted by the Claude agent. **Hansal must have it reviewed by
> an advocate before public launch** — particularly the Advocates Act and
> DPDP sections. Update this document after that review.

## The three regimes that govern us

1. **Advocates Act, 1961** — governs who can practise law in India.
   Determines whether NyayMitra is "practising law" (illegal for us) or
   providing "legal information" (permitted).
2. **Digital Personal Data Protection Act, 2023 (DPDP Act)** — governs how
   we handle personal data. Phased commencement; bulk operative provisions
   expected by mid-2027.
3. **Copyright Act, 1957** — governs reproduction of legal text and
   judgments. Statute text is government-public-domain; judgments are
   CC-BY-4.0 from the public S3 dataset.

## Advocates Act, 1961 — staying on the right side of the line

### The rule

**Section 29** of the Advocates Act prohibits any person other than an
enrolled advocate from practising law in any court or before any tribunal.
**Section 33** restricts the right to practise to enrolled advocates.
Together, these create a near-monopoly for advocates over **legal
practice** in India.

### What is "legal practice"?

Indian courts have not given an exhaustive definition, but the working
understanding is:

- **Legal practice** includes: representing a client before a court /
  tribunal, drafting and filing pleadings on behalf of a client, advising
  a specific client on the application of law to that client's specific
  facts, holding oneself out as an advocate.
- **Legal information / legal literacy** includes: explaining what the law
  says, explaining how procedures work in the abstract, publishing primary
  legal materials (statutes, judgments), conducting legal research and
  reporting it.

The line is the **"specific advice to a specific person about their
specific facts"** test. Crossing this line without being an advocate would
be unauthorised practice.

### How NyayMitra stays on the right side

| Allowed (information) | Not allowed (advice) |
|---|---|
| "BNSS s.58 says you must be produced before a Magistrate within 24 hours." | "Based on what you've told me about your arrest, you should file a habeas corpus petition." |
| "Bail under BNSS s.480 is discretionary in non-bailable offences." | "Your case under BNS s.103 is weak — you'll get bail." |
| Surfacing the IndiaCode text of a section. | Drafting a bail application for a specific user. |
| Generic step-by-step "how to file an FIR" walkthrough. | Reviewing a user's specific FIR and saying whether it's valid. |
| Explaining what the POSH Act 2013 says. | Recommending whether a specific user should file an internal complaint. |

### Operational rules

1. **Every citizen-facing output ends with the standard disclaimer.** The
   disclaimer states: not legal advice, no lawyer–client relationship,
   NyayMitra is not a law firm, consult an advocate for case-specific
   guidance.
2. **No "AI lawyer" or "replace lawyer" framing anywhere** — UI,
   marketing, scenario content. Such framing invites BCI scrutiny.
3. **No drafting of pleadings tied to specific user facts** in the citizen
   tier. The pro tier may include drafting templates with placeholders,
   but these are tools for advocates, not products for clients.
4. **Strict separation of pro tier from citizen tier.** Pro tier is
   positioned as a tool used by advocates in their practice — closer to
   existing tools like Manupatra than to a "lawyer replacement."
5. **Pointer to legal aid resources** in every citizen scenario (NALSA
   helpline 15100, DLSA, etc.).

### What if BCI or a state Bar Council raises an objection?

The position we will take:

- NyayMitra publishes legal information; that is constitutionally
  protected speech under Article 19(1)(a) and supports the public's right
  to know the law.
- Every output explicitly disclaims legal advice and a lawyer–client
  relationship.
- We do not represent any user in any forum.
- We point users to advocates, legal aid authorities, and legal services
  authorities — we are a feeder, not a substitute.

If escalated, engage proactively with BCI rather than litigate from a
defensive posture.

## DPDP Act, 2023 — what we do today and what we will do later

### Commencement timeline

- **11 August 2023** — Act enacted.
- **13 November 2025** — provisions establishing the Data Protection Board
  of India and ancillary provisions in force.
- **Approximately mid-2027** (one year + eighteen months from 13 Nov 2025
  per the staggered schedule) — bulk operative provisions in force,
  including Sections 3–5, most of Section 6, Sections 7–17, Sections
  28–34, etc.
- **Until then** — no general statutory data-protection regime is in force
  in India *operatively*. The IT Act 2000 + IT (Reasonable Security
  Practices and Procedures) Rules 2011 still apply.

### Our posture

We treat the DPDP Act as **already binding in spirit**. Three reasons:

1. The Act will be operative before our public launch.
2. The constitutional right to privacy under *Justice K.S. Puttaswamy*
   (2017) already requires us to handle personal data carefully.
3. Building DPDP-compliant infrastructure later is more expensive than
   building it correctly now.

### Concrete commitments

| DPDP concept | Our implementation |
|---|---|
| Notice + consent | Onboarding flow explains what we collect, why, and retention period. Granular consent for analytics, vernacular translation logging, etc. |
| Purpose limitation | Per-tier data-flow maps (in `docs/data-flows/` once written) — every collected field has a documented purpose. |
| Data minimisation | We collect no PII by default for citizen-tier Q&A. Pro tier collects bar council number + email only. |
| Cross-border transfer | **Tier 0 (local Ollama) is the default for any query containing PII** (planned). Egress to Tier 1 (Gemini, US) or Tier 2 (Claude, US) only after redaction. |
| Right to erasure | DELETE endpoint on user account; cascading delete on `query_logs`. |
| Right to access | Account export endpoint (JSON dump). |
| Significant Data Fiduciary obligations | We are not currently SDF-classified; will revisit at scale. |
| Children's data | We do not knowingly process children's data. UI age-gates the pro tier. |
| Data Protection Officer | Hansal is the de facto DPO at MVP scale. Designate formally before public launch. |
| Breach notification | Documented IR process; 72-hour notification window per draft DPDP Rules 2025. |

### The DPDP–RTI tension

The DPDP Act 2023 amended **RTI Act s.8(1)(j)** to read simply
*"information which relates to personal information."* This is a
substantive narrowing. Civil-society organisations have flagged this as a
serious accountability concern. NyayMitra explains this in scenario 6
(RTI). We do not take a partisan position; we present the legal text and
note the controversy.

## Copyright

### Statutes

**IndiaCode** is published by the Government of India. Bare Acts of
Parliament are **government works** under Section 17(d) of the Copyright
Act 1957, and the Government holds copyright. However, the **Copyright Act
exempts the reproduction of any matter** which has been **published in any
official Gazette** (Section 52(1)(q)(ii)) — and Acts of Parliament are
published in the Gazette before becoming law. So we can reproduce statute
text freely, with attribution.

### Supreme Court judgments

The public S3 dataset at `s3://indian-supreme-court-judgments` is licensed
under **Creative Commons Attribution 4.0 International (CC-BY-4.0)**. We
are required to:

- Display the attribution: *"Source: Vanga (2025). Indian Supreme Court
  Judgments. AWS Open Data Registry.
  `https://registry.opendata.aws/indian-supreme-court-judgments/`
  (CC-BY-4.0)"*
- Not imply endorsement by the licensors.
- Apply the same license (or compatible) to derivatives — though CC-BY
  does not have ShareAlike, we choose to apply CC-BY-SA 4.0 to our derived
  content as a value choice.

The attribution string is hard-coded as `ATTRIBUTION` in
`ingestion/sc_judgments_ingest.py` and must be displayed on any UI surface
showing judgment text or close paraphrases.

### High Court judgments

Same upstream provider, same license. When we add HC corpus.

### Our scenario content

`content/scenarios/*.md` is licensed CC-BY-SA 4.0. This forces attribution
and prevents proprietary forks while letting community contributions flow
in.

### Code

Apache License 2.0. Permissive, patent-grant included, well-understood by
enterprise.

## What we have NOT done yet

- [ ] Lawyer review of this document (book ASAP)
- [ ] Privacy policy for the public site
- [ ] Terms of service
- [ ] DPO designation
- [ ] DSAR (data subject access request) endpoint implementation
- [ ] Breach notification IR runbook
- [ ] Bar Council of India proactive engagement
