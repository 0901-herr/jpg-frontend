import type { ChatSession } from '../types'

const LD_BASE = (import.meta.env.VITE_LOGICALDOC_BASE_URL ?? 'http://localhost:8082').replace(
  /\/$/,
  '',
)

/** acluser_a test docs (folder acl-test-a) — see docs/LD_AUTH_VERIFICATION_SUMMARY.md */
const ACL_DOC_A = '5103'
const ACL_DOC_B = '5104'

function ldDocUrl(documentId: string, page?: number): string {
  const base = `${LD_BASE}/frontend.jsp?docId=${documentId}`
  return page != null && page >= 1 ? `${base}#page=${page}` : base
}

const DEMO_SOURCES = [
  {
    index: 1,
    filename: 'ACL Test Doc A.pdf',
    documentId: ACL_DOC_A,
    docRef: '[Doc1]',
    page: 1,
    reference: 'p. 1',
    url: ldDocUrl(ACL_DOC_A, 1),
    snippet: 'Sample excerpt from acluser_a document A (docId 5103).',
  },
  {
    index: 2,
    filename: 'ACL Test Doc B.pdf',
    documentId: ACL_DOC_B,
    docRef: '[Doc2]',
    page: 2,
    reference: 'p. 2',
    url: ldDocUrl(ACL_DOC_B, 2),
    snippet: 'Sample excerpt from acluser_a document B (docId 5104).',
  },
] as const

const COMPLETE_ANSWER = `Based on the selected documents:

**Revenue increased 12% year-over-year**, with growth led by enterprise subscriptions [Doc1].

*Operating expenses fell 4% in Q3* following office consolidation [Doc2].

Both figures come from the sections shown below. Click a source to open the document preview in LogicalDOC.`

const Q3_BREAKDOWN_ANSWER = `Here is the Q3 expense breakdown from the financial summary [Doc2]:

| Category | Q3 spend | Change |
| --- | ---: | ---: |
| People | $1.24m | +3% |
| Software | $680k | -8% |
| Offices | $420k | -14% |
| Professional services | $310k | +2% |

**Software and office costs produced the largest savings.**

*These figures are mock data for testing formatted chat responses.*`

/** Sample chat with citations and rich Markdown formatting. `title`
 * defaults to "Citation demo" (the `?demo=citations` route) — `/chat/demo/composer`
 * (P2-1, UI polish pass) reuses this same content for something realistic
 * to preview the composer against, but passes its own title rather than
 * inheriting "Citation demo", which reads as a copy/paste leftover on a
 * route that isn't about citations. */
export function createCitationDemoSession(title = 'Citation demo'): ChatSession {
  return {
    id: 'demo-citations-chat',
    title,
    messages: [
      {
        id: 'demo-user-1',
        role: 'user',
        content: 'What did our financial documents say about revenue and expenses?',
        authorUsername: 'Demo user',
      },
      {
        id: 'demo-assistant-1',
        role: 'assistant',
        status: 'complete',
        thinkingSeconds: 2,
        content: COMPLETE_ANSWER,
        sources: [...DEMO_SOURCES],
        question: 'What did our financial documents say about revenue and expenses?',
      },
      {
        id: 'demo-user-2',
        role: 'user',
        content: 'Can you break down Q3 expenses by category?',
        authorUsername: 'Demo user',
      },
      {
        id: 'demo-assistant-2',
        role: 'assistant',
        status: 'complete',
        thinkingSeconds: 1,
        content: Q3_BREAKDOWN_ANSWER,
        sources: [...DEMO_SOURCES],
        question: 'Can you break down Q3 expenses by category?',
      },
    ],
  }
}

/** Shared-chat demo as seen by a follower ("Demo user"): host Alice asked
 * first, then the viewer followed up — so author labels show two people. */
export function createShareDemoSession(): ChatSession {
  return {
    id: 'demo-share-chat',
    title: 'Q3 finance review',
    createdAt: '2026-09-18T09:00:00Z',
    visibility: 'query',
    shareToken: 'demo-share-token',
    ownerUsername: 'Alice',
    isOwner: false,
    canQuery: true,
    messageCount: 4,
    scopeDocumentIds: [ACL_DOC_A, ACL_DOC_B],
    scopeDocuments: [
      { documentId: ACL_DOC_A, filename: 'ACL Test Doc A.pdf' },
      { documentId: ACL_DOC_B, filename: 'ACL Test Doc B.pdf' },
    ],
    messages: [
      {
        id: 'demo-share-user-alice',
        role: 'user',
        content: 'What did our financial documents say about revenue and expenses?',
        authorUsername: 'Alice',
      },
      {
        id: 'demo-share-assistant-1',
        role: 'assistant',
        status: 'complete',
        thinkingSeconds: 2,
        content: COMPLETE_ANSWER,
        sources: [...DEMO_SOURCES],
        question: 'What did our financial documents say about revenue and expenses?',
      },
      {
        id: 'demo-share-user-viewer',
        role: 'user',
        content: 'Can you break down Q3 expenses by category?',
        authorUsername: 'Demo user',
      },
      {
        id: 'demo-share-assistant-2',
        role: 'assistant',
        status: 'complete',
        thinkingSeconds: 1,
        content: Q3_BREAKDOWN_ANSWER,
        sources: [...DEMO_SOURCES],
        question: 'Can you break down Q3 expenses by category?',
      },
    ],
  }
}

/** Demo with only the in-progress assistant reply (no completed answer). */
export function createCitationLoadingDemoSession(): ChatSession {
  return {
    id: 'demo-citations-loading',
    title: 'Loading demo',
    messages: [
      {
        id: 'demo-user-loading',
        role: 'user',
        content: 'What did our financial documents say about revenue and expenses?',
        authorUsername: 'Demo user',
      },
      {
        id: 'demo-assistant-thinking',
        role: 'assistant',
        status: 'thinking',
        content: '',
      },
    ],
  }
}
