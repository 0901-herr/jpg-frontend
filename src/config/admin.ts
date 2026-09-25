/** Admin dashboard — authorized by the signed-in LogicalDOC session cookie
 * (same `ai_session` cookie the chat API already uses), gated on `is_admin`
 * from `GET /api/auth/me`. There is no client-held admin secret: the adapter
 * decides admin access server-side from the session's username against its
 * own allow-list (`require_admin` in jpg-adapter), so a client-visible key
 * can never be extracted from the bundle. */

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
