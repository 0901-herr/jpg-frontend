/** Admin dashboard — uses adapter query API key, separate from chat cookie auth. */

export const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? ''
export const ADMIN_API_KEY_HEADER =
  import.meta.env.VITE_ADMIN_API_KEY_HEADER ?? 'X-Adapter-Query-Key'

/**
 * Build-time flag: serve the admin dashboard entirely from an in-memory
 * mock (`src/mocks/adminMockApi.ts`) instead of `fetch`-ing the adapter.
 * For working on the dashboard UI with no backend running at all — no
 * Postgres, LogicalDOC, or RAG Engine. Set `VITE_ADMIN_MOCK=true` in
 * `.env` (gitignored, local-only) and restart `npm run dev`.
 */
export const ADMIN_MOCK = import.meta.env.VITE_ADMIN_MOCK === 'true'

export const ADMIN_OVERVIEW_POLL_MS = 8_000
export const ADMIN_OVERVIEW_POLL_ACTIVE_MS = 3_000
export const ADMIN_DOCUMENT_POLL_MS = 5_000

export function isAdminConfigured(): boolean {
  // Dev: adapter allows admin without key when ADAPTER_QUERY_API_KEY is unset
  return true
}
