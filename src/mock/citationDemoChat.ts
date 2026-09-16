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

Revenue increased 12% year-over-year, with growth led by enterprise subscriptions [Doc1].

Operating expenses fell 4% in Q3 following office consolidation [Doc2].

Both figures come from the sections shown below. Click a source to open the document preview in LogicalDOC.`

/** Sample chat with inline [DocN] refs, a completed answer, and a loading reply. */
export function createCitationDemoSession(): ChatSession {
  return {
    id: 'demo-citations-chat',
    title: 'Citation demo',
    messages: [
      {
        id: 'demo-user-1',
        role: 'user',
        content: 'What did our financial documents say about revenue and expenses?',
      },
      {
        id: 'demo-assistant-1',
        role: 'assistant',
        status: 'complete',
        thinkingSeconds: 2,
        content: COMPLETE_ANSWER,
        sources: [...DEMO_SOURCES],
      },
      {
        id: 'demo-user-2',
        role: 'user',
        content: 'Can you break down Q3 expenses by category?',
      },
      {
        id: 'demo-assistant-2',
        role: 'assistant',
        status: 'streaming',
        content: 'Looking at the Q3 financial summary [Doc2], the largest expense categories were',
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
