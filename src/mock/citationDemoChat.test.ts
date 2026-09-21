import { describe, expect, it } from 'vitest'
import { createCitationDemoSession, createCitationLoadingDemoSession } from './citationDemoChat'

// P2-1 (UI polish pass): `/chat/demo/composer` (AppLayout.tsx's
// `createInitialSession`) used to inherit this session's default
// "Citation demo" title verbatim, which read as a copy/paste leftover on a
// route that isn't about citations at all.
describe('createCitationDemoSession', () => {
  it('defaults to the "Citation demo" title', () => {
    expect(createCitationDemoSession().title).toBe('Citation demo')
  })

  it('accepts an override title for a route that reuses this content for its own purpose', () => {
    expect(createCitationDemoSession('Composer demo').title).toBe('Composer demo')
  })

  it('keeps the same demo messages/sources regardless of the title override', () => {
    const withDefault = createCitationDemoSession()
    const withOverride = createCitationDemoSession('Composer demo')

    expect(withOverride.messages).toEqual(withDefault.messages)
    expect(withOverride.id).toBe(withDefault.id)
  })
})

describe('createCitationLoadingDemoSession', () => {
  it('keeps its own distinct title, unaffected by the citation-demo title override', () => {
    expect(createCitationLoadingDemoSession().title).toBe('Loading demo')
  })
})
